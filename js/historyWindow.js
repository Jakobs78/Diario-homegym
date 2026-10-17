export const OPERATIONAL_HISTORY_YEARS=4;

/** Calendar years: current year and previous three. Never deletes source data. */
export function historyWindow(data,now=new Date()){
    const root=data?.history || data || {};
    const years=root.years || {};
    const end=now.getFullYear(),start=end-OPERATIONAL_HISTORY_YEARS+1;
    const active={},archived={};
    for(const [year,value] of Object.entries(years)){
        if(/^\d{4}$/.test(year) && Number(year)>=start && Number(year)<=end)active[year]=value;
        else archived[year]=value;
    }
    return {start,end,active,archived,operational:{...root,years:active}};
}
