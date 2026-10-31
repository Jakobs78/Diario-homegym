/** JSONB object order is immaterial; array order and every value remain significant. */
export function canonicalJSON(value){
    return JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
}
export const sameJSON=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
export async function payloadHash(payload){
    const bytes=new TextEncoder().encode(canonicalJSON(payload));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function timedQuery(query,ms=25000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),ms);
    try{return await (typeof query.abortSignal==='function'?query.abortSignal(controller.signal):query);}
    finally{clearTimeout(timer);}
}
/** Bound auth requests too, preserving caller cancellation on older iOS versions. */
export async function deadlineFetch(input,options={}){
    const controller=new AbortController();
    const parent=options.signal||input?.signal;
    const abort=()=>controller.abort();
    if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,25000);
    try{return await globalThis.fetch(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
}
