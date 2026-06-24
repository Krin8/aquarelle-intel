import re
from urllib.parse import urlparse
from scrapy.spiders import CrawlSpider, Rule
from scrapy.linkextractors import LinkExtractor
from laguna_crawler.items import PageItem, ContactItem, DocumentItem
from markdownify import markdownify as md

class DeepSpider(CrawlSpider):
    name = "deep_spider"
    
    def __init__(self, target_url, corporate_url=None, *args, **kwargs):
        super(DeepSpider, self).__init__(*args, **kwargs)
        self.start_urls = [target_url]
        if corporate_url and corporate_url.lower() not in ['null', 'undefined', '']:
            self.start_urls.append(corporate_url)
        
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
                allow=(r'(?i)(about|contact|team|careers|company|who-we-are)'),
                restrict_text=(r'(?i)(about|contact|team|careers|who we are|get in touch|reach us)')
            ), callback='parse_page', follow=True),
            # Also randomly follow some other links if needed, but for now we focus on contact
            Rule(LinkExtractor(), callback='parse_page', follow=True),
        )
        self._compile_rules()

    def parse_start_url(self, response):
        # We want to scrape the root page just like any other page
        return self.parse_page(response)

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
        
        # Basic Page Item
        yield PageItem(
            url=response.url,
            title=page_title,
            meta_desc=meta_desc,
            headings=headings,
            body_text=body_text,
            markdown=markdown_text,
            links=[],
            images=[],
            content_length=len(response.body)
        )
        
        # Contact Extraction - Emails
        # We will iterate over common text-containing elements to find emails and their nearby context
        text_elements = response.xpath('//p | //span | //div | //li | //h1 | //h2 | //h3 | //h4 | //h5 | //h6 | //td')
        
        found_emails = set()
        
        for el in text_elements:
            el_text = ' '.join(el.xpath('.//text()').getall())
            el_text = re.sub(r'\s+', ' ', el_text).strip()
            
            clean_text = re.sub(r'\\?u[0-9a-fA-F]{4}', '', el_text)
            email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
            emails_in_el = re.findall(email_regex, clean_text)
            
            for e in emails_in_el:
                e = re.sub(r'[^a-zA-Z0-9._%+@-]', '', e)
                local_part = e.split('@')[0].lower()
                if len(local_part) < 2 or not local_part[0].isalpha():
                    continue
                    
                if e in found_emails:
                    continue
                found_emails.add(e)
                
                # Context-Aware Name Extraction
                name_context = el_text.replace(e, '').strip()
                # A name/role context should be reasonably short (e.g., "Jane Doe, Sales Director")
                if len(name_context) > 100 or len(name_context) < 3:
                    name_context = None
                
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
