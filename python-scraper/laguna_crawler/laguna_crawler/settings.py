BOT_NAME = "laguna_crawler"

SPIDER_MODULES = ["laguna_crawler.spiders"]
NEWSPIDER_MODULE = "laguna_crawler.spiders"

# Obey robots.txt rules
ROBOTSTXT_OBEY = True

# Safety net for standalone, single-brand runs
CLOSESPIDER_PAGECOUNT = 100

# Hardened Retry and Timeout settings
RETRY_ENABLED = True
RETRY_TIMES = 1
DOWNLOAD_TIMEOUT = 10

# Throttle and Delay settings
DOWNLOAD_DELAY = 1.5
RANDOMIZE_DOWNLOAD_DELAY = True

# AutoThrottle (Dynamic rate limiting based on load/latency)
AUTOTHROTTLE_ENABLED = True

# Set settings whose default value is deprecated to a future-proof value
REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
FEED_EXPORT_ENCODING = "utf-8"

# User Agent
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Configure item pipelines
ITEM_PIPELINES = {
    "laguna_crawler.pipelines.JsonOutputPipeline": 300,
}
