"""Yearly sales analysis from posted sales document lines (read-only)."""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from firebird_db import get_connection, _text, json_value

router=APIRouter(prefix='/api/sales-analysis',tags=['sales-analysis'])

class Criteria(BaseModel):
    year: int=Field(ge=2000,le=9999)
    compare_year: int=Field(ge=2000,le=9999)
    group_by: str='item'
    customers:list[str]=Field(default_factory=list)
    agents:list[str]=Field(default_factory=list)
    areas:list[str]=Field(default_factory=list)
    projects:list[str]=Field(default_factory=list)
    include_zero:bool=False
    sort_by: str='label'
    sort_direction: str='asc'

def clean(v): return _text(v).strip() if v is not None else ''
def query(cur,sql,params=()):
    cur.execute(sql,params); names=[_text(x[0]).strip().lower() for x in cur.description]
    return [dict(zip(names,row)) for row in cur.fetchall()]

def where(c):
    clauses=['COALESCE(H.CANCELLED,FALSE)=FALSE','EXTRACT(YEAR FROM H.POSTDATE) IN (?,?)']; params=[c.year,c.compare_year]
    for col,vals in [('CODE',c.customers),('AGENT',c.agents),('AREA',c.areas),('PROJECT',c.projects)]:
        if vals: clauses.append('TRIM(H.'+col+') IN ('+','.join('?' for _ in vals)+')');params.extend(vals)
    return ' AND '.join(clauses),params

def records(c):
    condition,params=where(c); con=get_connection()
    try:
        cur=con.cursor(); out=[]; errors=[]
        # Match the SQL Accounting control report: Sales Invoices and Cash Sales,
        # less Credit Notes. Sales Debit Notes are deliberately excluded.
        for head,detail,sign in [('SL_IV','SL_IVDTL',1),('SL_CS','SL_CSDTL',1),('SL_CN','SL_CNDTL',-1)]:
            try: fetched=query(cur,f'''SELECT H.POSTDATE,H.CODE,
                CAST(C.COMPANYNAME AS BLOB SUB_TYPE 0) AS CUSTOMERNAME,
                H.AGENT,H.AREA,H.PROJECT,
                D.ITEMCODE,CAST(I.DESCRIPTION AS BLOB SUB_TYPE 0) AS ITEMDESCRIPTION,
                D.LOCATION,D.BATCH,D.QTY,D.LOCALAMOUNT
                FROM {head} H JOIN {detail} D ON D.DOCKEY=H.DOCKEY
                LEFT JOIN ST_ITEM I ON I.CODE=D.ITEMCODE
                LEFT JOIN AR_CUSTOMER C ON C.CODE=H.CODE WHERE {condition}''',params)
            except Exception as exc:
                errors.append(f'{head}: {exc}')
                continue
            for r in fetched: r['_sign']=sign
            out+=fetched
        cur.close(); return out,errors
    finally: con.close()


def item_catalog():
    """All maintained items, including those with no sales movement."""
    con = get_connection()
    try:
        cur = con.cursor()
        items = query(cur, '''SELECT CODE,
            CAST(DESCRIPTION AS BLOB SUB_TYPE 0) AS DESCRIPTION
            FROM ST_ITEM WHERE CODE IS NOT NULL ORDER BY CODE''')
        cur.close()
        return [(clean(item['code']), clean(item['description'])) for item in items]
    finally:
        con.close()

@router.get('/options')
def options():
    con=get_connection()
    try:
        cur=con.cursor(); result={}
        for key,col in [('customers','CODE'),('agents','AGENT'),('areas','AREA'),('projects','PROJECT')]:
            result[key]=[clean(x['v']) for x in query(cur,f'SELECT DISTINCT {col} v FROM SL_IV WHERE {col} IS NOT NULL ORDER BY {col}')]
        result['years']=[int(x['y']) for x in query(cur,'SELECT DISTINCT EXTRACT(YEAR FROM POSTDATE) y FROM SL_IV WHERE POSTDATE IS NOT NULL ORDER BY y DESC')]
        cur.close(); return result
    finally: con.close()

@router.post('')
def analysis(c:Criteria):
    labels={'item':'Item code','customer':'Customer','agent':'Agent','area':'Area','project':'Document project','location':'Location'}
    if c.group_by not in labels: raise HTTPException(400,'Choose a valid grouping.')
    rows,errors=records(c)
    if errors:
        raise HTTPException(500,'Sales source query failed: '+' | '.join(errors))
    grouped=defaultdict(lambda:{'label':'','description':'','current':[Decimal(0)]*12,'previous':[Decimal(0)]*12,'quantity_current':[Decimal(0)]*12,'quantity_previous':[Decimal(0)]*12})
    for r in rows:
        key={'item':clean(r['itemcode']) or 'Unassigned item','customer':clean(r['code']) or 'Unassigned customer','agent':clean(r['agent']) or 'Unassigned','area':clean(r['area']) or 'Unassigned','project':clean(r['project']) or 'Unassigned','location':clean(r['location']) or 'Unassigned'}[c.group_by]
        if not key: key='Unassigned'
        x=grouped[key];x['label']=key
        if c.group_by=='item' and not x['description']:
            x['description']=clean(r.get('itemdescription'))
        if c.group_by=='customer' and not x['description']:
            x['description']=clean(r.get('customername'))
        month=r['postdate'].month-1; value=Decimal(r['localamount'] or 0)*r.get('_sign',1); qty=Decimal(r['qty'] or 0)*r.get('_sign',1)
        target='current' if r['postdate'].year==c.year else 'previous'; x[target][month]+=value;x['quantity_'+target][month]+=qty
    # Add every maintained item for a true zero-balance item report.
    if c.group_by == 'item' and c.include_zero:
        for code, description in item_catalog():
            if code:
                x = grouped[code]
                x['label'] = code
                if not x['description']:
                    x['description'] = description
    result=[]
    for x in grouped.values():
        x['total_current']=sum(x['current']);x['total_previous']=sum(x['previous']);x['variance']=x['total_current']-x['total_previous']
        if c.include_zero or x['total_current'] or x['total_previous']: result.append(x)
    if c.sort_by not in ('label','current','comparison','variance') or c.sort_direction not in ('asc','desc'):
        raise HTTPException(400,'Choose a valid sort order.')
    value_key={'label':'label','current':'total_current','comparison':'total_previous','variance':'variance'}[c.sort_by]
    # Text labels are case-insensitive; numeric columns retain their signed values.
    result.sort(key=lambda x:x[value_key].casefold() if c.sort_by=='label' else x[value_key],reverse=c.sort_direction=='desc')
    return {'criteria':c.model_dump(),'group_label':labels[c.group_by],'rows':[[k,json_value(v)] for k,v in []],'analysis':[{**x,'current':[float(v) for v in x['current']],'previous':[float(v) for v in x['previous']],'quantity_current':[float(v) for v in x['quantity_current']],'quantity_previous':[float(v) for v in x['quantity_previous']],'total_current':float(x['total_current']),'total_previous':float(x['total_previous']),'variance':float(x['variance'])} for x in result]}
