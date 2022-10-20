## Obsidian Notion Connector

This plugin connects Obsidian (https://obsidian.md) to Notion (https://notion.so).


## Installation

Either download the release zip-file and extract it inside the .obsidian/plugins - folder in your Vault, or 
use BRAT (https://github.com/TfTHacker/obsidian42-brat) to download and install the plugin. Then, activate the
Notion Connector plugin in the community plugins-section of the settings.

### Required plugins

The Notion connector uses several Obsidian community plugins to display the downloaded pages. To enable the full
functionality of this plugin (in particular, display of downloaded databases), make sure you download and activate

- Dataview
- Database Folder
- Banners

in the community plugin section.

## Configuration

To interact with the Notion SDK, you will need to create a Notion integration: go to https://www.notion.so/my-integrations
and click on "Create a new integration". Give it a descriptive name (e.g., "Obsidian") and enable the capabilities you wish to
use (currently, the plugin only reads from Notion, but at least limited updates will be supported in future releases).

Make sure your integration is associated with the Workspace you want to connect to Obsidian. Click Submit, and copy the
"Internal Integration Token" on the next page. Navigate to the settings of the Notion Connector plugin in Obsidian (in the community
plugins section of the settings), and paste the API token there.

In Notion, navigate to the page or database you want to access from Obsidian, then click the "..." - menu at the top right
of the page and click on "Add Connections". Use the search bar to search for the integration you just created. Obsidian now has
access to this page, and to all its children, so if you use the root of your workspace, you can access all content within.

### Usage

To download a page or database from Notion, click on the Notion-icon in the side bar or use the "Download page or db from Notion" 
command of the plugin. This opens a dialog where you can configure the ID of the Notion item you want to access, and the name of the 
file where you want to store the results. Downloading a database can take some time, so make sure you wait until the confirmation 
dialog pops up to ensure that everything has been downloaded completely. Then, you can open the result from your vault. If you 
opened the new note before the download finished, you might have to close and reopen it for the results to be displayed correctly.

Once a page has been downloaded, you can run the "Update current file from Notion" command, which will re-download the data and 
overwrite the note.