// Tests hors-ligne du lecteur RSS (aucun réseau, aucune clé). npm run test:rss
// Les extraits ci-dessous sont de VRAIS morceaux des 3 flux (récupérés le 25 septembre 2026),
// pour que le test porte sur le format réel et pas sur une supposition de ce à quoi il ressemble.
import assert from "node:assert/strict";
import { parseRssItems, RSS_FEEDS } from "./rss-lib.mjs";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  -", name); };

// Fed : titres en texte brut (avec entité &#39;), description/lien/date en CDATA.
const FED_MONETARY = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
    <channel>
        <title>FRB: Press Release - Monetary Policy</title>
        <item>
            <title>Federal Reserve issues FOMC statement</title>
            <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm]]></link>
            <guid><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm]]></guid>
            <description><![CDATA[Federal Reserve issues FOMC statement]]></description>
            <category>Monetary Policy</category>
            <pubDate><![CDATA[Wed, 16 Sep 2026 18:00:00 GMT]]></pubDate>    
        </item>
        <item>
            <title>Minutes of the Board&#39;s discount rate meetings on July 20 and July 29, 2026</title>
            <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20260825a.htm]]></link>
            <guid><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20260825a.htm]]></guid>
            <description><![CDATA[Minutes of the Board&#39;s discount rate meetings on July 20 and July 29, 2026]]></description>
            <category>Monetary Policy</category>
            <pubDate><![CDATA[Tue, 25 Aug 2026 18:00:00 GMT]]></pubDate>    
        </item>
    </channel>
</rss>`;

// CoinDesk : titres et description en CDATA, plusieurs balises <dc:creator>, media:content, etc.
const COINDESK = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>CoinDesk: Bitcoin, Ethereum, Crypto News and Price Data</title>
    <item>
      <title><![CDATA[Traders price in 4 Fed rate hikes by June 2027 as bitcoin slides below $83,000]]></title>
      <link>https://www.coindesk.com/markets/2026/09/24/traders-are-pricing-in-4-fed-rate-hikes-as-bitcoin-slides-below-usd83-000</link>
      <media:content url="https://cdn.sanity.io/x.jpg" type="image/*" medium="image"/>
      <guid isPermaLink="false">088c8781-3330-40c6-9247-e6394c9fed56</guid>
      <pubDate>Thu, 24 Sep 2026 10:11:51 +0000</pubDate>
      <description><![CDATA[The four-hike path is the most likely outcome, while rising bond yields and a stronger dollar weigh on bitcoin and gold.]]></description>
      <dc:creator>James Van Straten</dc:creator>
      <content:encoded/>
    </item>
    <item>
      <title><![CDATA[Crypto for Advisors:The hidden costs of holding your own bitcoin]]></title>
      <link>https://www.coindesk.com/coindesk-indices/2026/09/24/crypto-for-advisors-the-hidden-costs-of-holding-your-own-bitcoin</link>
      <guid isPermaLink="false">01879859-f3f6-4d7d-adc3-0172348364d6</guid>
      <pubDate>Thu, 24 Sep 2026 14:49:28 +0000</pubDate>
      <description/>
      <dc:creator>Dovile Silenskyte</dc:creator>
    </item>
  </channel>
</rss>`;

t("Fed (politique monétaire) : titres en texte brut, entité &#39; décodée, dates RFC-822 valides", () => {
  const items = parseRssItems(FED_MONETARY);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Federal Reserve issues FOMC statement");
  assert.equal(items[0].link, "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm");
  assert.equal(items[0].publishedAtIso, new Date("2026-09-16T18:00:00Z").toISOString());
  assert.equal(items[1].title, "Minutes of the Board's discount rate meetings on July 20 and July 29, 2026");
});

t("CoinDesk : titres en CDATA, description vide tolérée, ordre préservé", () => {
  const items = parseRssItems(COINDESK);
  assert.equal(items.length, 2);
  assert.match(items[0].title, /Traders price in 4 Fed rate hikes/);
  assert.match(items[0].summary, /bond yields and a stronger dollar/);
  assert.equal(items[1].summary, ""); // <description/> vide -> chaîne vide, pas de crash
});

t("un lien non-http(s), un titre manquant, ou une date invalide -> l'entrée est ignorée sans planter", () => {
  const xml = `<rss><channel>
    <item><title>Sans lien valide</title><link>not-a-url</link><pubDate>Thu, 24 Sep 2026 10:00:00 +0000</pubDate></item>
    <item><link>https://ex.com/x</link><pubDate>Thu, 24 Sep 2026 10:00:00 +0000</pubDate></item>
    <item><title>Date cassée</title><link>https://ex.com/y</link><pubDate>n'importe quoi</pubDate></item>
    <item><title>Celle-ci est valide</title><link>https://ex.com/z</link><pubDate>Thu, 24 Sep 2026 10:00:00 +0000</pubDate></item>
  </channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Celle-ci est valide");
});

t("entrée XML vide, cassée ou sans balise <item> -> tableau vide, jamais d'exception", () => {
  assert.deepEqual(parseRssItems(""), []);
  assert.deepEqual(parseRssItems("<not><valid xml"), []);
  assert.deepEqual(parseRssItems(undefined), []);
  assert.deepEqual(parseRssItems("<rss><channel><title>Vide</title></channel></rss>"), []);
});

t("les balises <description> avec du HTML à l'intérieur sont nettoyées en texte simple", () => {
  const xml = `<rss><channel><item>
    <title>Avec du HTML</title>
    <link>https://ex.com/a</link>
    <pubDate>Thu, 24 Sep 2026 10:00:00 +0000</pubDate>
    <description><![CDATA[<p>Un <b>résumé</b> avec des balises &amp; une esperluette.</p>]]></description>
  </item></channel></rss>`;
  const items = parseRssItems(xml);
  assert.equal(items[0].summary, "Un résumé avec des balises & une esperluette.");
});

t("RSS_FEEDS : 3 flux, chacun avec un nom et une URL https valides", () => {
  assert.equal(RSS_FEEDS.length, 3);
  for (const f of RSS_FEEDS) {
    assert.ok(f.name && f.name.length > 3);
    assert.match(f.url, /^https:\/\//);
  }
});

console.log(`\n${n} tests passés`);
