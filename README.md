# marathon-tif

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
