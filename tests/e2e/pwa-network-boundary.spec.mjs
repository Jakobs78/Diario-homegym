import {test,expect} from '@playwright/test';

test('offline Supabase requests reject as network failures while static PWA assets stay cached',async({browser})=>{
  const context=await browser.newContext({serviceWorkers:'allow'});
  const page=await context.newPage();
  try{
    // Standalone empty page. The app is not loaded, so no login, Supabase
    // credentials or real cloud calls can occur during this test.
    await page.route('**/sw-network-boundary-harness.html',route=>route.fulfill({
      status:200,contentType:'text/html',
      body:'<!doctype html><meta charset="utf-8"><title>Offline SW boundary test</title>'
    }));
    await page.goto('/sw-network-boundary-harness.html');
    const status=await page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      return {active:!!reg.active,scope:new URL(reg.scope).pathname};
    });
    expect(status).toEqual({active:true,scope:'/'});
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),
      {timeout:30000}).toBe(true);

    // Network is disconnected BEFORE the Supabase request is made.
    // The old service worker returned fake HTTP 200 JSON instead of failure.
    await context.setOffline(true);
    const offline=await page.evaluate(async()=>{
      let remote;
      try{
        const response=await fetch('https://ircdhfsojwqyuqjsmmen.supabase.co/rest/v1/workouts?select=updated_at');
        remote={transportError:false,status:response.status};
      }catch{
        remote={transportError:true};
      }
      let staticAsset;
      try{
        const response=await fetch('/index.html');
        staticAsset={ok:response.ok,status:response.status};
      }catch{
        staticAsset={ok:false};
      }
      return {remote,staticAsset};
    });
    expect(offline).toEqual({
      remote:{transportError:true},
      staticAsset:{ok:true,status:200}
    });
  }finally{
    await context.close();
  }
});
