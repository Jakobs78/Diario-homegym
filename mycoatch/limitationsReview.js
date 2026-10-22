export function recentPainReports(data,{now=Date.now()}={}){
    const reports=[];
    for(const year of Object.values(data?.history?.years||{}))for(const meso of year.mesocycles||[])
    for(const week of meso.weeks||[])for(const day of week.days||[]){
        const check=day.coachCheckin,at=Date.parse(check?.checkedAt||'');
        if(check?.pain!=='present'||!Number.isFinite(at)||at>now||now-at>42*86400000)continue;
        reports.push({checkedAt:check.checkedAt,movement:check.movement||'',location:check.location||'',dayName:day.dayName||'',exercises:(day.exercises||[]).map(ex=>ex.name)});
    }
    return reports.sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt));
}
