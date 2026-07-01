import scrapy

class ContactItem(scrapy.Item):
    email = scrapy.Field()
    phone = scrapy.Field()
    name = scrapy.Field()
    role = scrapy.Field()
    confidence = scrapy.Field()
    source_url = scrapy.Field()
    type = scrapy.Field() # e.g. "generic"

class PageItem(scrapy.Item):
    url = scrapy.Field()
    title = scrapy.Field()
    meta_desc = scrapy.Field()
    headings = scrapy.Field()
    body_text = scrapy.Field()
    markdown = scrapy.Field()
    links = scrapy.Field()
    images = scrapy.Field()
    content_length = scrapy.Field()

class DocumentItem(scrapy.Item):
    url = scrapy.Field()
    title = scrapy.Field()
    type = scrapy.Field() # catalog, lookbook, investor_report, other

class ProductItem(scrapy.Item):
    name = scrapy.Field()
    priceMin = scrapy.Field()
    imageUrl = scrapy.Field()
    category = scrapy.Field()
    sourceUrl = scrapy.Field()
