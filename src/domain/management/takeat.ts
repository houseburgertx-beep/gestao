import { Database, RecordData, cents, monthEnd, str } from './model';

/** Select whole source intervals. Monthly totals never become a daily sale. */
export function withTakeat(db: Database, f: {start:string; end:string; today:string}): Database {
  const end = f.end < f.today ? f.end : f.today;
  const selected: RecordData[] = [];
  const reports = (db.takeatReports || []).filter(r => !r.archived && r.source === 'takeat' && typeof r.totalRevenue === 'number' && Number.isFinite(Date.parse(str(r,'syncedAt'))));
  const byUnit = new Map<string, RecordData[]>();
  for(const r of reports) byUnit.set(r.unitId, [...(byUnit.get(r.unitId)||[]),r]);
  for(const list of Array.from(byUnit.values())) {
    const latest = new Map<string,RecordData>();
    for(const r of list) if(!latest.has(str(r,'date')) || str(r,'syncedAt') > str(latest.get(str(r,'date'))!,'syncedAt')) latest.set(str(r,'date'),r);
    const windows = Array.from(latest.values()).map(r => {
      const date=str(r,'date');
      const day = str(r,'syncedAt') ? new Date(new Date(str(r,'syncedAt')).getTime()-3*3600000).toISOString().slice(0,10) : '';
      const start = date.length===7 ? date+'-01' : date;
      const until = date.length===7 ? (monthEnd(date+'-01') < day ? monthEnd(date+'-01') : day) : date;
      return {...r,periodStart:start,periodEnd:until};
    }).filter(r => r.periodStart >= f.start && r.periodEnd <= end && r.periodEnd >= r.periodStart);
    const months=windows.filter(r=>str(r,'date').length===7);
    selected.push(...months,...windows.filter(r=>str(r,'date').length===10 && !months.some(m=>r.periodStart>=m.periodStart && r.periodEnd<=m.periodEnd)));
  }
  const generated: RecordData[]=[]; const coverage: RecordData[]=[];
  for(const r of selected) {
    // A reviewed canonical record takes precedence over its imported source window.
    if((db.revenues||[]).some(x=>x.unitId===r.unitId && !x.archived && str(x,'date')>=str(r,'periodStart') && str(x,'date')<=str(r,'periodEnd'))) continue;
    const channels:[string,string][]=[['salao','Salão'],['delivery','Delivery próprio'],['ifood','iFood']];
    const channelSum=channels.reduce((s,[key])=>s+(typeof r[key]==='number'?r[key] as number:0),0);
    const complete=channels.every(([key])=>typeof r[key]==='number') && Math.abs(channelSum-(r.totalRevenue as number))<0.02;
    const items=complete ? channels : [['totalRevenue','']];
    for(const [key,channel] of items) {
      generated.push({...r,id:`takeat-view-${r.id}-${key}`,kind:'revenues',date:str(r,'periodStart'),channel,gross:cents(r[key] as number),externalId:r.id,source:'takeat',discounts:null,coupons:null,cashback:null,cancellations:null,fees:null});
    }
    // Overall coverage includes only source-provided channels; unknown channels stay pending.
    for(const channel of ['',...(complete?channels.map(([,c])=>c):[])]) coverage.push({...r,id:`takeat-coverage-${r.id}-${channel}`,kind:'coverage',dataset:'revenues',channel,start:r.periodStart,end:r.periodEnd,confirmed:true,source:'takeat'});
  }
  return {...db,revenues:[...(db.revenues||[]),...generated],coverage:[...(db.coverage||[]),...coverage]};
}
