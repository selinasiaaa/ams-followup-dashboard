"""PDF renderer; receives a report snapshot as JSON on stdin, emits PDF on stdout."""
import json,sys
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.graphics.shapes import Drawing,Rect,String,Line

def money(v):
    if v is None: return '-'
    return f'({abs(v):,.2f})' if v<0 else f'{v:,.2f}'

def render(d):
    buf=BytesIO(); c=d['criteria']; columns=d['columns']
    # Wide reports have several horizontal panels, with account labels repeated.
    groups=[columns[i:i+(3 if c['percent'] else 5)] for i in range(0,len(columns),3 if c['percent'] else 5)]
    doc=SimpleDocTemplate(buf,pagesize=(842,595),leftMargin=28,rightMargin=28,topMargin=30,bottomMargin=30)
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='SmallReport',fontName='Helvetica',fontSize=8,leading=11))
    styles.add(ParagraphStyle(name='CellReport',fontName='Helvetica',fontSize=8,leading=10))
    def p(t,style='SmallReport'): return Paragraph(escape(str(t)),styles[style])
    story=[p(c['company'] or 'SQL Accounting BI','Title'),p(c['title'],'Heading2'),p(f"{c['start']} to {c['end']} | {d['unit']} | {c['basis']} | Financial year starts month {c['fiscal_month']}")]
    filters='; '.join(f'{k}: {", ".join(c[k])}' for k in ('projects','agents','areas','types') if c[k])
    if c['invoice']: filters+='; Document reference: '+c['invoice']
    if filters: story.append(p(filters))
    story += [Spacer(1,8),p(f"Summary: {d['focus'][0]} | {d['focus'][1]} to {d['focus'][2]}",'Heading3')]
    s=d['summaries'][c['focus']]
    kpis=[('Net sales','net_sales'),('COGS','cogs'),('Gross profit','gross_profit'),('Other income','other_income'),('Expenses','expenses'),('Net profit before tax','net_profit')]
    grid=Table([[p(label) for label,_ in kpis],[money(s[key]) for _,key in kpis]],colWidths=[131]*6)
    grid.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eafd')),('FONTSIZE',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('ALIGN',(0,1),(-1,-1),'RIGHT')]))
    story += [grid,Spacer(1,12),p('Monthly net sales, net purchases and expenses','Heading3')]
    months=d['monthly']; width=780; height=205
    draw=Drawing(width,height)
    vals=[m[k] for m in months for k in ('net_sales','net_purchases','expenses')]
    lo=min([0]+vals); hi=max([1]+vals); span=hi-lo
    y=lambda v:30+(v-lo)/span*145
    draw.add(Line(62,y(0),770,y(0),strokeColor=colors.grey))
    for i in range(5):
        v=lo+span*i/4; yy=y(v)
        draw.add(Line(62,yy,770,yy,strokeColor=colors.HexColor('#e5e7eb')))
        draw.add(String(58,yy-3,f'{v:,.0f}',textAnchor='end',fontSize=7))
    draw.add(String(8,190,d['unit'],fontSize=8))
    palette=['#8867e8','#c5ccef','#9dddf4']; slot=708/max(1,len(months))
    for i,m in enumerate(months):
        for j,key in enumerate(('net_sales','net_purchases','expenses')):
            v=m[key]; draw.add(Rect(62+i*slot+j*slot*.22,y(min(0,v)),slot*.2,abs(y(v)-y(0)),fillColor=colors.HexColor(palette[j]),strokeColor=None))
        if len(months)<=18 or i%max(1,len(months)//12)==0: draw.add(String(62+i*slot,16,m['month'],fontSize=6))
    for j,label in enumerate(('Net sales','Net purchases','Expenses')):
        draw.add(Rect(245+j*135,190,9,9,fillColor=colors.HexColor(palette[j]),strokeColor=None)); draw.add(String(259+j*135,191,label,fontSize=8))
    story += [draw,PageBreak()]
    if c.get('month_comparison'):
        metrics=[('Net sales','net_sales'),('Cost of goods sold','cogs'),('Gross profit','gross_profit'),('Other income','other_income'),('Expenses','expenses'),('Net profit before tax','net_profit')]
        month_groups=[d.get('monthly_comparison',[])[i:i+3] for i in range(0,len(d.get('monthly_comparison',[])),3)]
        for group_index,month_group in enumerate(month_groups):
            if group_index: story.append(PageBreak())
            story += [p('All-month P&L comparison','Heading2'),p('Actual vs same month last year | Variance = current year - previous year'),Spacer(1,8)]
            headers=[p('Amount ('+d['unit']+')')]
            for month in month_group:
                headers += [p(month['month']+'\nActual'),p(month['previous_month']+'\nPrevious year'),p('Variance')]
            table_data=[headers]
            for label,key in metrics:
                row=[p(label)]
                for month in month_group:
                    actual=month['current'].get(key,0); prior=month['previous'].get(key,0)
                    row += [money(actual),money(prior),money(actual-prior)]
                table_data.append(row)
            first_width=185; remainder=786-first_width
            comparison_table=Table(table_data,colWidths=[first_width]+[remainder/(len(month_group)*3)]*(len(month_group)*3),repeatRows=1)
            comparison_table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dce2ee')),('BACKGROUND',(3,0),(3,-1),colors.HexColor('#f0edff')),('BACKGROUND',(6,0),(6,-1),colors.HexColor('#f0edff')),('BACKGROUND',(9,0),(9,-1),colors.HexColor('#f0edff')),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(1,1),(-1,-1),'RIGHT'),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#d6dbe7')),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
            story.append(comparison_table)
        story.append(PageBreak())
    for panel,cols in enumerate(groups):
        if panel: story.append(PageBreak())
        story += [p(c['title'],'Heading2'),p(f"Report columns {panel+1}/{len(groups)} | {d['unit']}"),Spacer(1,8)]
        headers=[p('Account')]
        for col in cols:
            headers.append(p(f"{col['label']}\n{col['start']} to {col['end']}"))
            if c['percent']: headers.append(p('%'))
        data=[headers]; commands=[]
        for row in d['rows']:
            label=row['label']
            if row['kind']=='account': label=('  '*max(0,row.get('level',2)-2))+(row.get('code','')+' ' if c['codes'] else '')+label
            cells=[p(label,'CellReport')]
            for col in cols:
                value=row['values'].get(col['key'])
                cells.append('' if row['kind']=='section' else money(value))
                if c['percent']:
                    den=d['summaries'][col['key']][c['percent_basis']]
                    cells.append('' if row['kind']=='section' else (f'{value/den*100:,.1f}' if den and value is not None and not label.startswith('RETAINED') else '-'))
            idx=len(data); data.append(cells)
            if row['kind']=='section': commands += [('BACKGROUND',(0,idx),(-1,idx),colors.HexColor('#e8eafd'))]
            if row['kind'] in ('summary','total'): commands += [('LINEABOVE',(0,idx),(-1,idx),.6,colors.HexColor('#64748b')),('BACKGROUND',(0,idx),(-1,idx),colors.HexColor('#f4f5f9'))]
        remaining=786-270
        widths=[270]
        for _ in cols:
            widths += [remaining/len(cols)-52,52] if c['percent'] else [remaining/len(cols)]
        table=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('FONTNAME',(0,0),(-1,-1),'Helvetica'),('FONTSIZE',(1,0),(-1,-1),8),('ALIGN',(1,1),(-1,-1),'RIGHT'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dce2ee'))]+commands))
        story.append(table)
    story += [Spacer(1,16),p('Calculation notes','Heading3')]
    story += [p(w) for w in d['warnings']]
    if c['ledger']:
        story += [PageBreak(),p('Ledger transactions','Heading2')]
        rows=[[p(x) for x in ['Date','Account','Document','Description','Debit','Credit']]]
        rows += [[p(t['perioddate']),p(t['code']),p(t['ref1'] or ''),p(t['description2'] or t['description'] or ''),money(t['debit']),money(t['credit'])] for t in d['ledger']]
        table=Table(rows,colWidths=[65,80,95,320,113,113],repeatRows=1)
        table.setStyle(TableStyle([('FONTSIZE',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(4,1),(-1,-1),'RIGHT'),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dce2ee'))]))
        story.append(table)
    def footer(canvas,document):
        canvas.setFont('Helvetica',8); canvas.drawString(28,15,'SQL Accounting BI | '+d['unit']); canvas.drawRightString(814,15,f'Page {document.page}')
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return buf.getvalue()

if __name__=='__main__':
    sys.stdout.buffer.write(render(json.loads(sys.stdin.buffer.read())))
