# Privacy

RSC Classic Reader has no analytics SDK and does not transmit browsing history, article text, or personal information to its developer or any third party.

The extension stores only its enabled/disabled preference in Chrome Sync storage. On RSC issue pages, it requests the same-site AJAX endpoint that RSC uses for its Abstract button when a card approaches the viewport. It extracts a Visual Abstract image from the returned markup when one exists, without opening or inserting the text Abstract. Requests and image delivery are handled by RSC and its configured content hosts.

The extension does not save article pages, abstracts, figures, or PDFs to disk.
