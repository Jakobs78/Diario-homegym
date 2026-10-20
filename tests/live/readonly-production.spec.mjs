import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFullBackup } from '../../js/fullBackup.js';

const APP = 'https://diario-homegym.vercel.app/';
const EMAIL = process.env.HOMEGYM_E2E_EMAIL;
const PASSWORD = process.env.HOMEGYM_E2E_PASSWORD;

// This suite is manual and never changes workout records. Login and logout
// use only the dedicated test-account credentials stored in GitHub Secrets.
test.beforeEach(async ({page}) => {
  let blocked = 0;
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    // Authentication requires POST. Explicitly permit only login/refresh and
    // logout; deny every other write to REST, RPC, Functions and Storage.
    const allowedAuthWrite = method === 'POST' &&
      (url.pathname.startsWith('/auth/v1/token') ||
       url.pathname.startsWith('/auth/v1/logout'));
    if (!['GET','HEAD','OPTIONS'].includes(method) && !allowedAuthWrite) {
      blocked++;
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  page.blockedCloudWrites = () => blocked;
});

test('deployment includes current MyCoatch UI, manifest and service worker', async ({request}) => {
  const html = await request.get(APP);
  expect(html.status()).toBe(200);
  expect(await html.text()).toContain('id="mycoatch-deload-choice"');
  const manifestResponse = await request.get(APP + 'manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('HomeGym Diary');
  expect(manifest.display).toBe('standalone');
  const serviceWorker = await request.get(APP + 'sw.js');
  expect(serviceWorker.status()).toBe(200);
  expect(await serviceWorker.text()).toContain('workout-app-v61-mycoatch-deload-choice-ui-20261020');
});

test('login, authenticated Supabase read, browser persistence, backup and logout', async ({page}) => {
  if (!EMAIL || !PASSWORD) throw Error('Configure GitHub Actions secrets for the dedicated test account.');

  const responses = [];
  const authResponses = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/auth/v1/')) {
      authResponses.push({endpoint:url.pathname.split('/').slice(0,4).join('/'),status:response.status()});
    }
    if (url.hostname.endsWith('.supabase.co') &&
        url.pathname === '/rest/v1/workouts') {
      // Record metadata only. Never capture payload, email, URL or token.
      responses.push({method:response.request().method(),status:response.status()});
    }
  });

  await page.goto(APP, {waitUntil:'domcontentloaded'});
  await expect(page.locator('#auth-overlay')).toBeVisible();
  await page.locator('#auth-email').fill(EMAIL);
  await page.locator('#auth-password').fill(PASSWORD);
  // The login handler deliberately reloads the entire application.
  // Wait for that new document, not merely for the old overlay to vanish.
  const loginReload = page.waitForEvent('load',{timeout:45000});
  await page.locator('#auth-submit-btn').click();
  await loginReload;
  await expect(page.locator('#auth-overlay')).toBeHidden({timeout:45000});
  await expect.poll(async () => page.evaluate(() =>
    Boolean(window.supabase?.createClient && window.state?.currentUser?.id)
  ),{timeout:30000,intervals:[750,1500,2500]}).toBe(true);

  const firstSession = async () => page.evaluate(async expectedEmail => {
    const {supabase} = await import('/js/config.js');
    const {data,error} = await supabase.auth.getUser();
    return {ok:!error && !!data?.user?.id,
      accountMatches:data?.user?.email?.toLowerCase()===expectedEmail.toLowerCase()};
  }, EMAIL);
  try {
    await expect.poll(firstSession,{timeout:20000,intervals:[750,1500,2500]})
      .toEqual({ok:true,accountMatches:true});
  } catch (error) {
    // Safe diagnostics: never log identity, URLs, tokens, credentials or content.
    const diagnostics = await page.evaluate(async () => {
      const {supabase} = await import('/js/config.js');
      const {data:{session},error:sessionError} = await supabase.auth.getSession();
      const {data:{user},error:userError} = await supabase.auth.getUser();
      return {
        cachedSession:!!session,
        userPresent:!!user,
        getSessionErrorStatus:sessionError?.status ?? null,
        getSessionErrorCode:sessionError?.code ?? null,
        getUserErrorStatus:userError?.status ?? null,
        getUserErrorCode:userError?.code ?? null,
        appOfflineFlag:!!(await import('/js/state.js')).state.currentUser?.isOffline,
        authErrorShown:getComputedStyle(document.getElementById('auth-error')).display !== 'none',
        authOverlayShown:getComputedStyle(document.getElementById('auth-overlay')).display !== 'none'
      };
    });
    console.log('LOGIN_DIAGNOSTICS',JSON.stringify({
      authResponses,diagnostics,blockedCloudWrites:page.blockedCloudWrites()
    }));
    throw error;
  }

  // This is a real authenticated Supabase SELECT (not a mocked frontend read).
  let cloud;
  const cloudAttempts = [];
  try {
    await expect.poll(async () => {
      cloud = await page.evaluate(async () => {
        const {supabase} = await import('/js/config.js');
        const {data:{session},error:sessionError} = await supabase.auth.getSession();
        const {data:{user},error:authError} = await supabase.auth.getUser();
        if (authError || !user) return {
          authenticated:false,readOk:false,hasRow:false,
          sessionPresent:!!session,
          sessionErrorStatus:sessionError?.status ?? null,
          authErrorStatus:authError?.status ?? null,
          authErrorCode:authError?.code ?? null
        };
        const {data,error} = await supabase.from('workouts')
          .select('payload,updated_at').eq('email',user.email).maybeSingle();
        return {authenticated:true,readOk:!error,hasRow:!!data,
          validPayload:!data || (!!data.payload && typeof data.payload==='object'),
          sessionPresent:!!session,
          selectErrorStatus:error?.status ?? null,
          selectErrorCode:error?.code ?? null};
      });
      cloudAttempts.push({authenticated:cloud.authenticated,readOk:cloud.readOk,
        sessionPresent:cloud.sessionPresent,authErrorCode:cloud.authErrorCode ?? null,
        authErrorStatus:cloud.authErrorStatus ?? null,
        selectErrorCode:cloud.selectErrorCode ?? null});
      return cloud.authenticated && cloud.readOk && cloud.validPayload;
    },{timeout:20000,intervals:[750,1500,2500]}).toBe(true);
  } catch(error) {
    console.log('CLOUD_READ_DIAGNOSTICS',JSON.stringify({
      attempts:cloudAttempts,authResponses,blockedCloudWrites:page.blockedCloudWrites()
    }));
    throw error;
  }
  if (cloudAttempts.length>1) {
    console.log('CLOUD_READ_RETRIES',cloudAttempts.length);
  }
  expect(responses.some(r=>r.method==='GET' && r.status>=200 && r.status<300)).toBe(true);

  // Distinguish remote-data hydration from simply showing a signed-in shell.
  if (cloud.hasRow) {
    await expect.poll(async () => page.evaluate(async () => {
      const {supabase} = await import('/js/config.js');
      const {state} = await import('/js/state.js');
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) return false;
      const {data,error} = await supabase.from('workouts')
        .select('payload').eq('email',user.email).maybeSingle();
      return !error && !!data?.payload &&
        JSON.stringify(data.payload)===JSON.stringify(state.workoutData);
    }), {timeout:20000}).toBe(true);
  }

  // Verify the app can export a real full-fidelity archive from its UI, and
  // parse it without invoking the destructive restore action.
  await page.locator('#open-tools-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="backup-json"]').click()
  ]);
  const bytes = await readFile(await download.path(), 'utf8');
  const archive = JSON.parse(bytes);
  expect(archive.format).toBe('homegym-diary-full-backup');
  expect(archive.version).toBe(1);
  const parsed = readFullBackup(bytes);
  expect(parsed).toEqual(archive.data);
  // Neither the backup nor its contents are uploaded as CI artifacts.

  await page.reload({waitUntil:'load'});
  await expect(page.locator('#auth-overlay')).toBeHidden({timeout:30000});
  await expect.poll(async () => page.evaluate(() =>
    Boolean(window.supabase?.createClient && window.state?.currentUser?.id)
  ),{timeout:30000}).toBe(true);
  const stillSignedIn = await page.evaluate(async expectedEmail => {
    const {supabase} = await import('/js/config.js');
    const {data:{user},error} = await supabase.auth.getUser();
    return !error && user?.email?.toLowerCase()===expectedEmail.toLowerCase();
  }, EMAIL);
  expect(stillSignedIn).toBe(true);

  await page.locator('#app-utility-menu summary').click();
  const logoutReload = page.waitForEvent('load',{timeout:30000});
  await page.locator('#user-info-bar').click();
  await logoutReload;
  await expect(page.locator('#auth-overlay')).toBeVisible({timeout:30000});
  const signedOut = await page.evaluate(async () => {
    const {supabase} = await import('/js/config.js');
    const {data:{session}} = await supabase.auth.getSession();
    return session === null;
  });
  expect(signedOut).toBe(true);
  expect(page.blockedCloudWrites()).toBe(0);
});
