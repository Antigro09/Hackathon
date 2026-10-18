// Playwright CLI run-code file: install before clicking Run. No model call here.
async page=>{
  const origin=new URL(page.url()).origin;
  const config=await(await page.request.get(`${origin}/remote-manifest.json`)).json();
  await page.route('https://**/*',async route=>{
    const request=route.request(),item=config.files.find(x=>x.url===request.url());
    if(!item||!['GET','HEAD'].includes(request.method())||request.postDataBuffer()) {
      await page.evaluate(x=>{window.legacyBaselineHarness.state.network.push(x);},{url:request.url(),method:request.method(),blocked:true});await route.abort('blockedbyclient');return;
    }
    const response=await page.request.get(`${origin}/remote/${item.index}`);
    if(!response.ok())throw Error('Pinned artifact mirror unavailable');
    await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*','access-control-expose-headers':'*','content-length':String(item.bytes)}});
    await page.evaluate(x=>{window.legacyBaselineHarness.state.network.push(x);},{url:item.url,method:request.method(),sha256:item.sha256,bytes:item.bytes,servedFromVerifiedLocalSnapshot:true});
  });
  await page.evaluate(()=>{window.legacyBaselineRoutingInstalled=true;});
  console.log({routingInstalled:true,pinnedArtifacts:config.files.length,noInference:true});
}
