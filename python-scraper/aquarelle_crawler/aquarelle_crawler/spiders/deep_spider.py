import re
from urllib.parse import urlparse
from scrapy.spiders import CrawlSpider, Rule
from scrapy.linkextractors import LinkExtractor
from aquarelle_crawler.items import PageItem, ContactItem, DocumentItem, ProductItem
from markdownify import markdownify as md
import json
import urllib.request
import xml.etree.ElementTree as ET
import scrapy

class DeepSpider(CrawlSpider):
    name = "deep_spider"
    
    def __init__(self, target_url, corporate_url=None, scrape_target='all', *args, **kwargs):
        super(DeepSpider, self).__init__(*args, **kwargs)
        self.start_urls = [target_url]
        if corporate_url and corporate_url.lower() not in ['null', 'undefined', '']:
            self.start_urls.append(corporate_url)
        self.products_scraped = 0
        self.scrape_target = scrape_target
        
        self.allowed_domains = []
        for url in self.start_urls:
            domain = urlparse(url).netloc
            if domain.startswith('www.'):
                domain = domain[4:]
            if domain not in self.allowed_domains:
                self.allowed_domains.append(domain)
        
        # Add a custom rule just for this spider
        DeepSpider.rules = (
            Rule(LinkExtractor(
                allow=(r'(?i)(about|contact|team|careers|company|who-we-are|shop|product|collections|mens|shirts|p\/|item)')
            ), callback='parse_page', follow=True),
            # Also randomly follow some other links if needed, but for now we focus on contact
            Rule(LinkExtractor(), callback='parse_page', follow=True),
        )
        self._compile_rules()

    def start_requests(self):
        product_urls = set()
        
        # Only parse sitemaps for products if we actually need them
        if self.scrape_target in ['all', 'images']:
            # Attempt to find product URLs from sitemaps to solve SPA crawling issues
            for base_url in self.start_urls:
                domain = urlparse(base_url).netloc
                scheme = urlparse(base_url).scheme
                robots_url = f"{scheme}://{domain}/robots.txt"
                
                try:
                    req = urllib.request.Request(robots_url, headers={'User-Agent': 'Mozilla/5.0'})
                    robots_txt = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
                    sitemaps = set(re.findall(r'(?i)Sitemap:\s*(.*)', robots_txt))
                    
                    # Add default common sitemap if none found
                    if not sitemaps:
                        sitemaps.add(f"{scheme}://{domain}/sitemap.xml")
                    
                    for smap in sitemaps:
                        smap = smap.strip()
                        try:
                            smap_req = urllib.request.Request(smap, headers={'User-Agent': 'Mozilla/5.0'})
                            smap_xml = urllib.request.urlopen(smap_req, timeout=5).read()
                            root = ET.fromstring(smap_xml)
                            
                            for child in root:
                                loc = child.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
                                if loc is not None and loc.text:
                                    text_lower = loc.text.lower()
                                    if 'product' in text_lower or 'item' in text_lower or 'shop' in text_lower or smap.endswith('sitemap.xml'):
                                        if loc.text.endswith('.xml'):
                                            # It's an index, fetch the child
                                            child_req = urllib.request.Request(loc.text, headers={'User-Agent': 'Mozilla/5.0'})
                                            child_xml = urllib.request.urlopen(child_req, timeout=5).read()
                                            child_root = ET.fromstring(child_xml)
                                            for c in child_root:
                                                cloc = c.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
                                                if cloc is not None and cloc.text:
                                                    if not cloc.text.endswith('.xml'):
                                                        product_urls.add(cloc.text)
                                                    if len(product_urls) >= 100:
                                                        break
                                        else:
                                            product_urls.add(loc.text)
                                            
                                if len(product_urls) >= 100:
                                    break
                        except Exception:
                            continue
                        if len(product_urls) >= 100:
                            break
                except Exception:
                    pass

            # Yield requests for all discovered product URLs to guarantee we hit product pages
            for url in list(product_urls)[:100]:
                yield scrapy.Request(url, callback=self.parse_page)

        # Yield default start urls for standard crawling
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse_page)

    def parse_page(self, response):
        # Only parse HTML responses
        if not hasattr(response, 'text'):
            return

        page_path = urlparse(response.url).path.lower()
        
        page_title = response.xpath('//title/text()').get() or ''
        meta_desc = response.xpath('//meta[@name="description"]/@content').get() or response.xpath('//meta[@property="og:description"]/@content').get() or ''
        
        headings = response.xpath('//h1/text() | //h2/text() | //h3/text()').getall()
        headings = [h.strip() for h in headings if h.strip()]
        
        texts = response.xpath('//body//text()[not(ancestor::script|ancestor::style)]').getall()
        body_text = ' '.join(texts)
        body_text = re.sub(r'\s+', ' ', body_text).strip()
        
        main_html = response.xpath('//main').get() or response.xpath('//body').get() or ''
        markdown_text = md(main_html)[:15000]
        
        # Image extraction
        page_images = []
        seen_srcs = set()
        for img in response.xpath('//img'):
            src = img.attrib.get('src') or img.attrib.get('data-src') or img.attrib.get('data-lazy-src') or ''
            if not src:
                srcset = img.attrib.get('srcset', '')
                first_entry = srcset.split(',')[0].strip().split()[0] if srcset else ''
                src = first_entry
            if not src or src.startswith('data:'):
                continue
            # Resolve relative URLs
            src = response.urljoin(src)
            # Skip tracking pixels
            w = img.attrib.get('width', '')
            h = img.attrib.get('height', '')
            try:
                if (w and int(w) < 50) or (h and int(h) < 50):
                    continue
            except ValueError:
                pass
            if 'pixel' in src or 'spacer' in src or 'tracking' in src:
                continue
            alt = img.attrib.get('alt', '')[:100]
            if src not in seen_srcs:
                seen_srcs.add(src)
                page_images.append({'src': src, 'alt': alt})

        # Basic Page Item
        yield PageItem(
            url=response.url,
            title=page_title,
            meta_desc=meta_desc,
            headings=headings,
            body_text=body_text,
            markdown=markdown_text,
            links=[],
            images=page_images,
            content_length=len(response.body)
        )
        
        # Contact Extraction - Emails
        # We search the extracted body text directly to prevent O(N^2) XPath traversal on large DOMs
        clean_text = re.sub(r'\\?u[0-9a-fA-F]{4}', '', body_text)
        email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        raw_emails = re.findall(email_regex, clean_text)
        
        found_emails = set()
        for e in raw_emails:
            e = re.sub(r'[^a-zA-Z0-9._%+@-]', '', e)
            local_part = e.split('@')[0].lower()
            if len(local_part) < 2 or not local_part[0].isalpha():
                continue
                
            if e in found_emails:
                continue
            found_emails.add(e)
            
            # Context-Aware Name Extraction
            # To avoid the slow XPath loop, we just use a small window around the email in body_text
            idx = clean_text.find(e)
            name_context = None
            if idx != -1:
                window_start = max(0, idx - 40)
                window_end = idx
                context_str = clean_text[window_start:window_end].strip()
                if len(context_str) > 3:
                    # Very rough heuristic for a name preceding the email
                    name_context = context_str.split('  ')[-1].strip()
            
            # Confidence Scoring
            is_contact_page = any(kw in page_path for kw in ['contact', 'team', 'about', 'who-we-are'])
            confidence = 70 if is_contact_page else 50
            
            generic_prefixes = ['info', 'support', 'hiring', 'customercare', 'hello', 'admin', 'sales', 'press', 'media', 'noreply', 'contact']
            is_generic = any(prefix in local_part for prefix in generic_prefixes)
            
            contact_type = "unknown"
            if is_generic:
                confidence = min(confidence, 40)
                contact_type = "generic"
                
            if name_context and not is_generic:
                confidence += 15
                
            yield ContactItem(
                email=e,
                phone=None,
                name=name_context or "Unknown",
                role=None,
                confidence=confidence,
                source_url=response.url,
                type=contact_type
            )
        
        # Contact Extraction - Phones
        phone_regex = r'(?<!\d)\+?(?:[0-9][\s\-\.]?){9,14}[0-9](?!\d)'
        raw_phones = re.findall(phone_regex, body_text)
        
        found_phones = set()
        for p in raw_phones:
            p = p.strip()
            digits = re.sub(r'\D', '', p)
            if not (10 <= len(digits) <= 15):
                continue
            if '.' in p or len(p.split('-')) > 4:
                continue
            if len(digits) > 11 and not p.startswith('+') and ' ' not in p and '-' not in p:
                continue
            if len(digits) == 10 and (p.startswith('16') or p.startswith('17')):
                continue
                
            if p in found_phones:
                continue
            found_phones.add(p)
            
            is_contact_page = any(kw in page_path for kw in ['contact', 'team', 'about', 'who-we-are'])
            confidence = 60 if is_contact_page else 40
            
            yield ContactItem(
                email=None,
                phone=p,
                name="Phone Contact",
                role=None,
                confidence=confidence,
                source_url=response.url,
                type="phone"
            )

        # Document Extraction
        links = response.xpath('//a[@href]')
        found_docs = set()
        
        for link in links:
            href = link.xpath('@href').get()
            text = ' '.join(link.xpath('.//text()').getall()).strip().lower()
            if not href:
                continue
                
            href_lower = href.lower()
            doc_type = None
            
            if href_lower.endswith('.pdf') or 'catalog' in href_lower or 'lookbook' in href_lower:
                if 'catalog' in text or 'catalog' in href_lower:
                    doc_type = 'catalog'
                elif 'lookbook' in text or 'lookbook' in href_lower:
                    doc_type = 'lookbook'
                elif 'investor' in text or 'annual' in text or 'report' in text:
                    doc_type = 'investor_report'
                else:
                    doc_type = 'other'
            
            if doc_type:
                full_url = response.urljoin(href)
                if full_url in found_docs:
                    continue
                found_docs.add(full_url)
                
                title = text if len(text) > 2 else full_url.split('/')[-1]
                if len(title) > 200:
                    title = title[:197] + "..."
                    
                yield DocumentItem(
                    url=full_url,
                    title=title,
                    type=doc_type
                )
        
        # Product Extraction from JSON-LD
        if self.products_scraped < 50:
            json_lds = response.xpath('//script[@type="application/ld+json"]/text()').getall()
            for script_text in json_lds:
                if self.products_scraped >= 50:
                    break
                try:
                    data = json.loads(script_text)
                    if isinstance(data, dict):
                        data = [data]
                    
                    for item in data:
                        if self.products_scraped >= 50:
                            break
                            
                        # Handle both direct @type and graph structures
                        if isinstance(item, dict):
                            items_to_check = item.get('@graph', [item])
                            
                            for sub_item in items_to_check:
                                if not isinstance(sub_item, dict):
                                    continue
                                    
                                item_type = sub_item.get('@type', '')
                                if item_type == 'Product' or (isinstance(item_type, list) and 'Product' in item_type):
                                    name = sub_item.get('name', '')
                                    if not name:
                                        continue
                                        
                                    category_val = sub_item.get('category', '')
                                    cat_str = str(category_val).lower()
                                    if 'shirt' not in name.lower() and 'shirt' not in cat_str and 'shirt' not in response.url.lower():
                                        continue
                                        
                                    image_url = None
                                    image_data = sub_item.get('image')
                                    if isinstance(image_data, str):
                                        image_url = image_data
                                    elif isinstance(image_data, list) and len(image_data) > 0:
                                        image_url = image_data[0]
                                    elif isinstance(image_data, dict):
                                        image_url = image_data.get('url', '')
                                        
                                    price_min = None
                                    price_currency = None
                                    offers = sub_item.get('offers')
                                    if isinstance(offers, dict):
                                        price_min = offers.get('price') or offers.get('lowPrice')
                                        price_currency = offers.get('priceCurrency')
                                    elif isinstance(offers, list) and len(offers) > 0:
                                        price_min = offers[0].get('price') or offers[0].get('lowPrice')
                                        price_currency = offers[0].get('priceCurrency')
                                        
                                    try:
                                        if price_min is not None:
                                            price_min = float(str(price_min).replace('$', '').replace(',', '').replace('₹', '').replace('Rs.', ''))
                                            if price_currency == 'INR':
                                                price_min = price_min / 83.5
                                    except ValueError:
                                        price_min = None
                                        
                                    if image_url:
                                        yield ProductItem(
                                            name=name,
                                            priceMin=price_min,
                                            imageUrl=image_url,
                                            category=sub_item.get('category', ''),
                                            sourceUrl=response.url
                                        )
                                        self.products_scraped += 1
                except json.JSONDecodeError:
                    # Try to fix common JSON-LD errors (e.g. unescaped newlines)
                    try:
                        clean_script = script_text.replace('\n', '\\n').replace('\r', '')
                        data = json.loads(clean_script)
                        if isinstance(data, dict):
                            data = [data]
                            
                        for item in data:
                            if self.products_scraped >= 50:
                                break
                                
                            if isinstance(item, dict):
                                items_to_check = item.get('@graph', [item])
                                
                                for sub_item in items_to_check:
                                    if not isinstance(sub_item, dict):
                                        continue
                                        
                                    item_type = sub_item.get('@type', '')
                                    if item_type == 'Product' or (isinstance(item_type, list) and 'Product' in item_type):
                                        name = sub_item.get('name', '')
                                        if not name:
                                            continue
                                            
                                        category_val = sub_item.get('category', '')
                                        cat_str = str(category_val).lower()
                                        if 'shirt' not in name.lower() and 'shirt' not in cat_str and 'shirt' not in response.url.lower():
                                            continue
                                            
                                        image_url = None
                                        image_data = sub_item.get('image')
                                        if isinstance(image_data, str):
                                            image_url = image_data
                                        elif isinstance(image_data, list) and len(image_data) > 0:
                                            image_url = image_data[0]
                                        elif isinstance(image_data, dict):
                                            image_url = image_data.get('url', '')
                                            
                                        price_min = None
                                        price_currency = None
                                        offers = sub_item.get('offers')
                                        if isinstance(offers, dict):
                                            price_min = offers.get('price') or offers.get('lowPrice')
                                            price_currency = offers.get('priceCurrency')
                                        elif isinstance(offers, list) and len(offers) > 0:
                                            price_min = offers[0].get('price') or offers[0].get('lowPrice')
                                            price_currency = offers[0].get('priceCurrency')
                                            
                                        try:
                                            if price_min is not None:
                                                price_min = float(str(price_min).replace('$', '').replace(',', '').replace('₹', '').replace('Rs.', ''))
                                                if price_currency == 'INR':
                                                    price_min = price_min / 83.5
                                        except ValueError:
                                            price_min = None
                                            
                                        if image_url:
                                            yield ProductItem(
                                                name=name,
                                                priceMin=price_min,
                                                imageUrl=image_url,
                                                category=sub_item.get('category', ''),
                                                sourceUrl=response.url
                                            )
                                            self.products_scraped += 1
                    except Exception:
                        pass
                except Exception:
                    pass
