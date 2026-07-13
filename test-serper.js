const apiKey = process.env.SERPER_API_KEY;
fetch('https://google.serper.dev/search', {
  method: 'POST',
  headers: {
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    q: "India Apparels and Textile Fair's exhibitor list apparel brands",
    num: 20,
  }),
})
.then(res => res.text().then(text => console.log(res.status, text.substring(0, 100))))
.catch(console.error);
