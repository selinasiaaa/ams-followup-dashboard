"""Local Gmail SMTP delivery for customer statements. Credentials stay in memory only."""
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from io import BytesIO
import smtplib
import ssl
import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from customer_statement import StatementCriteria, build

router = APIRouter(prefix="/api/statement-email", tags=["statement-email"])
_settings = {"sender": "kahwei03@gmail.com", "app_password": "xdtc ljpm cpom oqbz"}
_scheduled = None
_lock = threading.Lock()

class GmailSettings(BaseModel):
    sender: str
    app_password: str

class DispatchRequest(BaseModel):
    criteria: StatementCriteria
    subject_template: str = "Statement of Account - {customer_name}"
    body_template: str = "Dear {attention_or_customer},\n\nPlease find attached your Statement of Account for the period {period_start} to {period_end}.\n\nThank you.\n{sender}"

class ScheduleRequest(DispatchRequest):
    run_at: datetime

def _pdf(statement, criteria):
    out = BytesIO(); doc = SimpleDocTemplate(out, pagesize=A4, rightMargin=32, leftMargin=32, topMargin=35, bottomMargin=35)
    styles = getSampleStyleSheet(); story = [Paragraph("Customer Statement", styles['Title']), Paragraph(f"{statement['name']} ({statement['code']})", styles['Heading2']), Paragraph(f"Statement period: {criteria.start} to {criteria.end}", styles['Normal']), Spacer(1, 12)]
    rows = [["Date", "Reference", "Description", "Debit", "Credit", "Balance"]]
    for tx in statement['transactions']:
        rows.append([tx['date'], tx['reference'] or '', tx['description'] or '', f"{tx['debit']:,.2f}" if tx['debit'] else '', f"{tx['credit']:,.2f}" if tx['credit'] else '', f"{tx['balance']:,.2f}"])
    if len(rows) == 1: rows.append(['', '', 'No transactions in this period.', '', '', ''])
    rows.append(['', '', 'Closing balance', '', '', f"{statement['closing']:,.2f}"])
    table = Table(rows, colWidths=[55,72,210,64,64,70], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#354363')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#cbd2df')),('ALIGN',(3,1),(-1,-1),'RIGHT'),('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#eef2f8')),('FONTSIZE',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [table, Spacer(1, 16), Paragraph('This is a computer-generated statement. Please report any discrepancy promptly.', styles['Normal'])]
    doc.build(story); return out.getvalue()

def _personalize(template, statement, criteria):
    """Use only known merge fields; unknown braces remain visible to the user."""
    values = {
        'customer_name': statement.get('name') or '',
        'customer_code': statement.get('code') or '',
        'attention': statement.get('attention') or '',
        'attention_or_customer': statement.get('attention') or statement.get('name') or 'Customer',
        'period_start': str(criteria.start), 'period_end': str(criteria.end),
        'statement_date': str(criteria.statement_date or criteria.end),
        'closing_balance': f"{float(statement.get('closing') or 0):,.2f}",
        'sender': _settings['sender'],
    }
    for key, value in values.items():
        template = template.replace('{' + key + '}', value)
    return template

def _deliver(request):
    if not _settings['app_password']:
        raise ValueError('Configure the Gmail App Password first.')
    criteria = request.criteria
    report = build(criteria); sent, failed = [], list(report['email_failures'])
    context = ssl.create_default_context()
    with smtplib.SMTP('smtp.gmail.com', 587, timeout=30) as client:
        client.starttls(context=context); client.login(_settings['sender'], _settings['app_password'])
        lookup = {s['code']: s for s in report['statements']}
        for recipient in report['email_recipients']:
            try:
                statement = lookup[recipient['code']]; message = EmailMessage()
                message['From'] = _settings['sender']; message['To'] = recipient['email']
                message['Subject'] = _personalize(request.subject_template, statement, criteria)
                message.set_content(_personalize(request.body_template, statement, criteria))
                message.add_attachment(_pdf(statement, criteria), maintype='application', subtype='pdf', filename=f"statement-{statement['code']}-{criteria.end}.pdf")
                client.send_message(message); sent.append({**recipient, 'subject': message['Subject']})
            except Exception as exc: failed.append({**recipient, 'reason': str(exc)})
    return {'sent': sent, 'failed': failed}

@router.get('/status')
def status():
    scheduled = None if not _scheduled else {k: _scheduled[k] for k in ('run_at', 'recipient_count')}
    return {'sender': _settings['sender'], 'configured': bool(_settings['app_password']), 'scheduled': scheduled}

@router.post('/settings')
def settings(values: GmailSettings):
    if '@' not in values.sender or '.' not in values.sender.rsplit('@', 1)[-1]:
        raise HTTPException(status_code=400, detail='Enter a valid Gmail address.')
    _settings['sender'] = values.sender.strip(); _settings['app_password'] = values.app_password.replace(' ', '')
    return {'sender': _settings['sender'], 'configured': True}

@router.post('/send')
def send(request: DispatchRequest):
    try: return _deliver(request)
    except Exception as exc: raise HTTPException(status_code=400, detail=str(exc))

@router.post('/schedule')
def schedule(request: ScheduleRequest):
    global _scheduled
    # Malaysia uses a fixed UTC+08:00 offset and does not observe daylight saving time.
    malaysia_time = timezone(timedelta(hours=8), name='MYT')
    when = request.run_at.replace(tzinfo=request.run_at.tzinfo or malaysia_time)
    seconds = (when - datetime.now(when.tzinfo)).total_seconds()
    if seconds <= 0: raise HTTPException(status_code=400, detail='Choose a future date and time.')
    def run():
        global _scheduled
        try: _deliver(request)
        finally: _scheduled = None
    with _lock:
        if _scheduled and _scheduled.get('timer'): _scheduled['timer'].cancel()
        timer = threading.Timer(seconds, run); timer.daemon = True; timer.start()
        _scheduled = {'run_at': when.isoformat(), 'recipient_count': len(build(request.criteria)['email_recipients']), 'timer': timer}
    return {'run_at': when.isoformat(), 'message': 'Scheduled. Keep the dashboard server running until this time.'}
