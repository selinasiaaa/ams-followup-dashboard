"""Read-only management reporting. All periods use inclusive calendar dates."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Literal
from firebird_db import get_connection, json_value, _text

router = APIRouter(prefix='/api/reporting')
GROUPS = [('SL','SALES'),('SA','SALES ADJUSTMENT'),('CO','COST OF GOODS SOLD'),('OI','OTHER INCOME'),('EO','EXTRA ORDINARY INCOME'),('EP','EXPENSES'),('TX','TAXATION')]
ZERO = Decimal('0')

class Criteria(BaseModel):
    start: date
    end: date
    columns: list[str] = Field(default_factory=lambda: ['current','ytd'])
    basis: Literal['POSTDATE','DOCDATE'] = 'POSTDATE'
    projects: list[str] = Field(default_factory=list)
    agents: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)
    types: list[str] = Field(default_factory=list)
    invoice: str = Field('', max_length=120)
    currency: str = Field('local', max_length=20)
    fiscal_month: int = Field(1, ge=1, le=12)
    depth: int = Field(2, ge=1, le=20)
    zero: bool = False
    codes: bool = True
    second: bool = False
    percent: bool = False
    percent_basis: Literal['sales','net_sales'] = 'sales'
    manufacturing: bool = True
    leaves: bool = False
    retained: bool = True
    title: str = Field('Statement of Comprehensive Income', max_length=150)
    company: str = Field('', max_length=150)
    focus: str = 'current'
    compare: str = 'previous_period'
    ledger: bool = False
    project_comparison: bool = False
    month_comparison: bool = False

def query(cur, sql, params=()):
    cur.execute(sql, params)
    names = [_text(c[0]).strip().lower() for c in cur.description]
    return [dict(zip(names,row)) for row in cur.fetchall()]

def clean(v):
    return _text(v).strip() if v is not None else ''

def previous_year(d):
    return d.replace(year=d.year-1, day=min(d.day,monthrange(d.year-1,d.month)[1]))

def definitions(c):
    if c.start > c.end:
        raise ValueError('From date must be on or before To date.')
    if c.start.year < 1901 or c.end.year > 9998 or (c.end-c.start).days > 3660:
        raise ValueError('Choose a period of at most ten years, within 1901–9998.')
    fy = date(c.end.year - (c.end.month < c.fiscal_month),c.fiscal_month,1)
    lm = c.end.replace(day=1)-timedelta(days=1)
    base = {
        'current': ('Selected period',c.start,c.end),
        'mtd': ('Month to date',c.end.replace(day=1),c.end),
        'ytd': ('Year to date',fy,c.end),
        'last_month': ('Last month',lm.replace(day=1),lm),
        'previous_period': ('Previous period',c.start-timedelta(days=(c.end-c.start).days+1),c.start-timedelta(days=1)),
        'last_year': ('Same period last year',previous_year(c.start),previous_year(c.end)),
        'previous_year': ('Previous financial year',date(fy.year-1,fy.month,1),fy-timedelta(days=1)),
    }
    return base

def signed(kind, dr, cr):
    amount = Decimal(dr or 0)-Decimal(cr or 0)
    return -amount if kind in ('SL','SA','OI','EO','RE') else amount

def summary(amounts, accounts):
    groups = defaultdict(lambda: ZERO)
    for code,value in amounts.items():
        if code in accounts:
            groups[accounts[code]['acctype']] += value
    sales = groups['SL']+groups['SA']
    gross = sales-groups['CO']
    net = gross+groups['OI']+groups['EO']-groups['EP']
    return dict(sales=groups['SL'],net_sales=sales,cogs=groups['CO'],gross_profit=gross,other_income=groups['OI']+groups['EO'],expenses=groups['EP'],tax=groups['TX'],net_profit=net,after_tax=net-groups['TX'],gross_margin=gross/sales*100 if sales else None,net_margin=(net-groups['TX'])/sales*100 if sales else None)

def load(c):
    periods=definitions(c)
    if not c.columns or len(c.columns)>10 or len(set(c.columns))!=len(c.columns):
        raise ValueError('Select 1–10 different report columns.')
    allowed=set(periods)|{'month_budget','year_budget','month_variance','year_variance'}
    if set(c.columns)-allowed or c.focus not in periods or c.compare not in periods:
        raise ValueError('Unknown report period.')
    con=get_connection()
    try:
        cur=con.cursor()
        # Read descriptions as binary BLOBs.  Some databases hold legacy
        # characters, and BLOB SUB_TYPE 0 prevents Firebird transliteration
        # from failing before _text can decode the value safely.
        accounts=query(cur,'''SELECT DOCKEY,PARENT,CODE,
            CAST(DESCRIPTION AS BLOB SUB_TYPE 0) AS DESCRIPTION,
            CAST(DESCRIPTION2 AS BLOB SUB_TYPE 0) AS DESCRIPTION2,
            ACCTYPE,SPECIALACCTYPE FROM GL_ACC''')
        accounts={clean(a['code']):{k:clean(v) if isinstance(v,(str,bytes)) or hasattr(v,'read') else v for k,v in a.items()} for a in accounts}
        for code, account in accounts.items():
            # An empty description is valid, but a code is still clearer than
            # an empty line in the report.
            account['description'] = account['description'] or code
        # Report reads share this connection/transaction snapshot.
        where=['COALESCE(T.CANCELLED,FALSE)=FALSE',f'T."{c.basis}" < ?']
        end=max(v[2] for v in periods.values())
        params=[end+timedelta(days=1)]
        for field,values in [('PROJECT',c.projects),('AGENT',c.agents),('AREA',c.areas),('FROMDOCTYPE',c.types)]:
            if values:
                if len(values)>100: raise ValueError('Too many filter values.')
                where.append(f'TRIM(T."{field}") IN ({",".join("?" for _ in values)})')
                params.extend(values)
        if c.invoice:
            where.append('T.REF1 CONTAINING ?'); params.append(c.invoice)
        if c.currency!='local':
            where.append('TRIM(T.CURRENCYCODE)=?'); params.append(c.currency)
        debit,credit=('LOCALDR','LOCALCR') if c.currency=='local' else ('DR','CR')
        transactions=query(cur,f'''SELECT T.DOCKEY,T.CODE,T."{c.basis}" AS PERIODDATE,T.DOCDATE,T.POSTDATE,
            T.FROMDOCTYPE,T.PROJECT,T.AGENT,T.AREA,
            T."{debit}" AS DEBIT,T."{credit}" AS CREDIT
            FROM GL_TRANS T JOIN GL_ACC A ON A.CODE=T.CODE
            WHERE {' AND '.join(where)} AND A.ACCTYPE IN ('SL','SA','CO','OI','EO','EP','TX','RE','AP')
            ORDER BY T."{c.basis}",T.DOCKEY''',params)
        stocks=query(cur,'''SELECT D.SYEAR,D.SMONTH,D.PROJECT,D.AMOUNT,S.OPENINGSTOCK,S.CLOSINGSTOCK
            FROM GL_STOCKDTL D JOIN GL_STOCK S ON S.DOCKEY=D.DOCKEY''')
        budgets=query(cur,'SELECT PROJECT,BYEAR,BMONTH,ACCOUNT,DR,CR FROM GL_BUDGET')
        cur.close()
    finally: con.close()
    for t in transactions:
        t['code']=clean(t['code'])
        t['perioddate']=t['perioddate'].date() if hasattr(t['perioddate'],'date') else t['perioddate']
        t['amount']=signed(accounts[t['code']]['acctype'],t['debit'],t['credit'])
    return periods,accounts,transactions,stocks,budgets

def build(c):
    periods,accounts,transactions,stocks,budgets=load(c)
    warnings=[]
    scoped=bool(c.agents or c.areas or c.types or c.invoice or c.currency!='local')
    if scoped:
        warnings.append('Filtered transaction analysis: stock valuations, retained earnings and budgets have no matching agent/area/document/currency detail and are excluded.')
    if not budgets:
        warnings.append('No budgets have been entered in SQL Accounting. Budget columns show 0; variance is actual minus budget.')
    warnings.append('Stock uses the preceding month closing value as opening stock and the selected ending month value as closing stock. Missing month entries are treated as 0.')
    def eligible(a):
        if c.manufacturing: return True
        seen=set()
        while a and a['code'] not in seen:
            if a['specialacctype']=='MC': return False
            seen.add(a['code']); a=byid.get(a['parent'])
        return True
    byid={a['dockey']:a for a in accounts.values()}
    active={code:a for code,a in accounts.items() if eligible(a)}
    def period(start,end,project=None,budget=False):
        amounts=defaultdict(lambda: ZERO)
        for t in transactions:
            if t['code'] in active and start<=t['perioddate']<=end and (project is None or clean(t['project'])==project):
                amounts[t['code']]+=t['amount']
        if budget:
            amounts=defaultdict(lambda: ZERO)
            if not scoped:
                for b in budgets:
                    code=clean(b['account']); p=clean(b['project'])
                    if code in active and (not c.projects or p in c.projects) and (project is None or p==project) and (start.year,start.month)<=(b['byear'],b['bmonth'])<=(end.year,end.month):
                        amounts[code]+=signed(active[code]['acctype'],b['dr'],b['cr'])
            return amounts
        if not scoped:
            prev=start.replace(day=1)-timedelta(days=1)
            for s in stocks:
                p=clean(s['project'])
                if (c.projects and p not in c.projects) or (project is not None and p!=project): continue
                for code,sign,dt in [(clean(s['openingstock']),1,prev),(clean(s['closingstock']),-1,end)]:
                    if code in active and (s['syear'],s['smonth'])==(dt.year,dt.month): amounts[code]+=Decimal(s['amount'] or 0)*sign
        return amounts
    amounts={key:period(start,end) for key,(_,start,end) in periods.items()}
    for key,actual in [('month_budget','mtd'),('year_budget','ytd')]:
        _,start,end=periods[actual]
        amounts[key]=period(start,end,budget=True)
        periods[key]=('Month budget' if key=='month_budget' else 'YTD budget',start,end)
        variance='month_variance' if key=='month_budget' else 'year_variance'
        amounts[variance]={code:amounts[actual].get(code,ZERO)-amounts[key].get(code,ZERO) for code in active}
        periods[variance]=('Month variance' if key=='month_budget' else 'YTD variance',start,end)
    summaries={key:summary(vals,active) for key,vals in amounts.items()}
    selected=list(c.columns)
    if c.project_comparison:
        projects=c.projects or sorted({clean(t['project']) for t in transactions if c.start<=t['perioddate']<=c.end})
        if len(projects)>12: raise ValueError('Select up to 12 projects for project comparison.')
        selected=[]
        for i,p in enumerate(projects):
            key=f'project_{i}'; selected.append(key)
            periods[key]=(p or 'Unassigned',c.start,c.end); amounts[key]=period(c.start,c.end,p); summaries[key]=summary(amounts[key],active)
        if not selected: raise ValueError('No projects match this period.')
    rows=[]
    def add(kind,label,vals,**extra):
        rows.append(dict(kind=kind,label=label,values={k:vals.get(k,ZERO) for k in selected},**extra))
    def subtotal(label,metric):
        add('summary',label,{k:summaries[k][metric] for k in selected})
    descendants={}
    def codes_under(a,seen=None):
        if a['code'] in descendants: return descendants[a['code']]
        seen=set() if seen is None else seen
        if a['code'] in seen: raise ValueError('Circular chart-of-accounts hierarchy.')
        seen=seen|{a['code']}
        codes=[a['code']]
        for child in children.get(a['dockey'],[]): codes+=codes_under(child,seen)
        descendants[a['code']]=codes
        return codes
    children=defaultdict(list)
    for a in active.values(): children[a['parent']].append(a)
    for v in children.values(): v.sort(key=lambda a:a['code'])
    def account_row(a,level):
        codes=codes_under(a); branch=children.get(a['dockey'],[])
        vals={k:sum((amounts[k].get(code,ZERO) for code in codes),ZERO) for k in selected}
        if not c.zero and not any(vals.values()): return
        if c.leaves and branch:
            # Preserve postings directly to parent accounts.
            own={k:amounts[k].get(a['code'],ZERO) for k in selected}
            if any(own.values()): add('account',a['description']+' (direct postings)',own,code=a['code'],codes=[a['code']],level=level,parent=None)
            for child in branch: account_row(child,level+1)
            return
        label=(a['description2'] or a['description']) if c.second else a['description']
        add('account',label,vals,code=a['code'],codes=codes,level=level,parent=clean(byid.get(a['parent'],{}).get('code')),expandable=bool(branch and level<c.depth))
        if level<c.depth:
            for child in branch: account_row(child,level+1)
    for group,label in GROUPS:
        group_codes=[code for code,a in active.items() if a['acctype']==group and not code.startswith('_')]
        vals={k:sum((amounts[k].get(code,ZERO) for code in group_codes),ZERO) for k in selected}
        if c.zero or any(vals.values()):
            add('section',label,{},code=group)
            roots=[a for a in active.values() if a['acctype']==group and not a['code'].startswith('_') and (a['parent'] not in byid or clean(byid[a['parent']]['code']).startswith('_'))]
            if c.depth>1 or c.leaves:
                for a in sorted(roots,key=lambda a:a['code']): account_row(a,2)
            add('total','Total '+label,vals)
        if group=='SA': subtotal('NET SALES','net_sales')
        if group=='CO': subtotal('GROSS PROFIT/(LOSS)','gross_profit')
        if group=='EP': subtotal('NET PROFIT/(LOSS) BEFORE TAX','net_profit')
        if group=='TX': subtotal('NET PROFIT/(LOSS) AFTER TAX','after_tax')
    if c.retained and not scoped and not c.project_comparison:
        bf={}; cf={}
        for k in selected:
            if 'budget' in k or 'variance' in k: bf[k]=None; cf[k]=None; continue
            _,start,end=periods[k]
            prior=period(date(1900,1,1),start-timedelta(days=1))
            re=sum((value for code,value in prior.items() if active[code]['acctype']=='RE'),ZERO)
            bf[k]=re+summary(prior,active)['after_tax']
            cf[k]=bf[k]+summaries[k]['after_tax']+sum((value for code,value in amounts[k].items() if active[code]['acctype']=='RE'),ZERO)
        add('summary','RETAINED EARNINGS B/F',bf); add('summary','RETAINED EARNINGS C/F',cf)
        warnings.append('Retained earnings include historical P&L and retained-earnings postings. Appropriations or opening balances outside GL_TRANS require reconciliation.')
    _,focus_start,focus_end=periods[c.focus]
    monthly=[]; monthly_comparison=[]; dt=focus_start.replace(day=1)
    while dt<=focus_end:
        last=dt.replace(day=monthrange(dt.year,dt.month)[1]); vals=period(max(dt,focus_start),min(last,focus_end))
        s=summary(vals,active)
        # Net purchases excludes stock valuation and manufacturing movement.
        purchase=ZERO
        for code,value in vals.items():
            a=active[code]
            if a['acctype']=='CO' and a['specialacctype'] not in ('OS','CS','MC'): purchase+=value
        monthly.append(dict(month=dt.strftime('%Y-%m'),**s,net_purchases=purchase))
        prior_start=previous_year(max(dt,focus_start))
        prior_end=previous_year(min(last,focus_end))
        prior_summary=summary(period(prior_start,prior_end),active)
        monthly_comparison.append(dict(month=dt.strftime('%b %Y'),previous_month=prior_start.strftime('%b %Y'),current=s,previous=prior_summary))
        dt=last+timedelta(days=1)
    breakdown={}
    for group in ('SL','EP'):
        breakdown[group]=sorted([dict(code=code,label=active[code]['description'],value=value) for code,value in amounts[c.focus].items() if active[code]['acctype']==group and value],key=lambda v:abs(v['value']),reverse=True)
    columns=[dict(key=k,label=periods[k][0],start=periods[k][1],end=periods[k][2],variance='variance' in k) for k in selected]
    ledger=[]
    for t in transactions:
        if t['code'] in active and active[t['code']]['acctype'] in dict(GROUPS) and min(v['start'] for v in columns)<=t['perioddate']<=max(v['end'] for v in columns):
            ledger.append({k:v for k,v in t.items()})
    return dict(version=5,criteria=c.model_dump(mode='json'),unit='RM' if c.currency=='local' else ('Local document currency' if c.currency=='----' else c.currency),columns=columns,rows=rows,summaries=summaries,monthly=monthly,monthly_comparison=monthly_comparison,breakdown=breakdown,focus=periods[c.focus],comparison=periods[c.compare],warnings=warnings,ledger=ledger,stock_adjustments=stocks if not scoped else [],budget_count=len(budgets))

def serialize(value):
    if isinstance(value,dict): return {k:serialize(v) for k,v in value.items()}
    if isinstance(value,(tuple,list)): return [serialize(v) for v in value]
    return json_value(value)

@router.get('/options')
def options():
    con=get_connection()
    try:
        cur=con.cursor(); result={}
        for key,column in [('projects','PROJECT'),('agents','AGENT'),('areas','AREA'),('types','FROMDOCTYPE'),('currencies','CURRENCYCODE')]:
            result[key]=[clean(r['item']) for r in query(cur,f'SELECT DISTINCT {column} AS ITEM FROM GL_TRANS WHERE {column} IS NOT NULL ORDER BY {column}')]
        for table in ('GL_STOCKDTL','GL_BUDGET'):
            result['projects']=sorted(set(result['projects'])|{clean(r['item']) for r in query(cur,f'SELECT DISTINCT PROJECT AS ITEM FROM {table} WHERE PROJECT IS NOT NULL')})
        cur.close(); return result
    finally: con.close()

@router.post('/profit-loss')
def report(c:Criteria):
    try: return serialize(build(c))
    except ValueError as exc: raise HTTPException(400,str(exc))

@router.post('/profit-loss.pdf')
def pdf(c:Criteria):
    import json,os,subprocess,sys
    from pathlib import Path
    try:
        data=serialize(build(c))
        runtime=os.environ.get('PDF_PYTHON')
        if not runtime:
            import importlib.util
            if importlib.util.find_spec('reportlab'): runtime=sys.executable
            else: runtime=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
        process=subprocess.run([runtime,str(Path(__file__).with_name('report_pdf.py'))],input=json.dumps(data).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,check=True)
        if not process.stdout.startswith(b'%PDF-'): raise RuntimeError('PDF generator did not return a PDF.')
        return Response(process.stdout,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="profit-loss-{c.start}-{c.end}.pdf"'})
    except ValueError as exc: raise HTTPException(400,str(exc))
    except (OSError,subprocess.SubprocessError,RuntimeError) as exc:
        raise HTTPException(503,'PDF export could not start. Install reportlab in the server environment or configure PDF_PYTHON.') from exc
