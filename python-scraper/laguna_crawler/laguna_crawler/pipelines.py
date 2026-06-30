import json
from itemadapter import ItemAdapter
from laguna_crawler.items import PageItem, ContactItem, DocumentItem, ProductItem

class JsonOutputPipeline:
    def __init__(self):
        self.pages = []
        self.contacts = []
        self.documents = []
        self.products = []

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        if isinstance(item, PageItem):
            self.pages.append(adapter.asdict())
        elif isinstance(item, ContactItem):
            self.contacts.append(adapter.asdict())
        elif isinstance(item, DocumentItem):
            self.documents.append(adapter.asdict())
        elif isinstance(item, ProductItem):
            self.products.append(adapter.asdict())
        return item

    def close_spider(self, spider):
        # We write everything to stdout at the very end
        # The spider must print ONLY this JSON. 
        # Scrapy logs should go to stderr.
        result = {
            "success": True,
            "data": {
                "pages": self.pages,
                "contacts": self.contacts,
                "documents": self.documents,
                "products": self.products
            }
        }
        print(json.dumps(result))
