import sys
import os
import json
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No URL provided"}))
        sys.exit(1)

    url = sys.argv[1]

    # Set the Scrapy settings module so get_project_settings() works
    os.environ.setdefault('SCRAPY_SETTINGS_MODULE', 'laguna_crawler.settings')

    # Important: In order for Scrapy to find the settings and modules, we need to add laguna_crawler to sys.path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    laguna_crawler_dir = os.path.join(current_dir, 'laguna_crawler')
    if laguna_crawler_dir not in sys.path:
        sys.path.insert(0, laguna_crawler_dir)
    
    target_url = sys.argv[1]
    corporate_url = sys.argv[2] if len(sys.argv) > 2 else None

    # Now get settings (this will pick up settings.py because of SCRAPY_SETTINGS_MODULE)
    settings = get_project_settings()
    
    # Disable log output to stdout so it doesn't corrupt our JSON output
    settings.set('LOG_ENABLED', False)

    # Initialize process
    process = CrawlerProcess(settings)

    # Import the spider directly
    from laguna_crawler.spiders.deep_spider import DeepSpider

    # We add the spider with the URL passed in as an argument
    process.crawl(DeepSpider, target_url=target_url, corporate_url=corporate_url)
    
    # Start the crawling process (blocks until completion)
    process.start()

if __name__ == "__main__":
    main()
