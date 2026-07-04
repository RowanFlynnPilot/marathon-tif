# marathon-tif

The TIF Scorecard — is tax increment financing in Marathon County paying
off? District-by-district performance built from Wisconsin Department of
Revenue public data, for Wausau Pilot & Review.

**Live:** https://rowanflynnpilot.github.io/marathon-tif/

## Data sources

- **TID value certifications** (statewide Excel, one file per year, 2019+):
  `https://www.revenue.wi.gov/SLFReportstif/{year}tifcomun.xlsx`
- **PE-300 TID Annual Reports** (DOR Vault public REST API, 2018+):
  `https://ww2.revenue.wi.gov/VaultPublic/rest/tidar/comun/comuninformationget/{year}`
  for the index, then
  `https://ww2.revenue.wi.gov/VaultPublic/rest/core/submission?subId=TIDAR-{year}-{auth}-{tidnum}-{tidacct}&system=tidar`
  per filing.

`fetch_tif_data.py` distills both into `public/data/districts.json`. Data
refreshes monthly via GitHub Actions; a data commit redeploys the site.

## Embedding

The widget posts its rendered height to the host page whenever it changes
(load, drilldown expand/collapse), so the iframe can resize instead of
clipping or leaving dead space. Payload: `{ source: "marathon-tif",
height: <number> }`.

```html
<iframe id="marathon-tif" src="https://rowanflynnpilot.github.io/marathon-tif/"
        style="width: 100%; border: 0;" title="The TIF Scorecard"></iframe>
<script>
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://rowanflynnpilot.github.io") return;
    if (!event.data || event.data.source !== "marathon-tif") return;
    document.getElementById("marathon-tif").style.height =
      event.data.height + "px";
  });
</script>
```

`embed-test.html` in the repo root exercises this against a local dev server
(`npm run dev`, then open `http://localhost:5173/marathon-tif/embed-test.html`).

## Development

```
npm install
npm run dev     # local dev server
npm run build   # production build to dist/
```

Deep links: `?district=<id>` (e.g. `?district=37291-003`) opens that
district's drilldown on load and scrolls to it. Unknown ids are ignored.
