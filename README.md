# Obsidian Metadata Filter Plugin

A powerful plugin for Obsidian that allows you to filter files based on their frontmatter metadata. Whether you want to focus on specific categories of notes, hide completed tasks, or organize your vault by custom metadata, this plugin makes it easy.

## Features

- **Dynamic Filtering**: Filter files in your vault based on their frontmatter metadata
- **Multiple Filter Types**: Support for various comparison operators:
  - Equals exactly
  - Contains text
  - Field exists
  - Includes value (for arrays)
  - Greater than (for numbers)
  - Less than (for numbers)
- **Flexible Value Types**: Handle different types of metadata:
  - Text
  - Numbers
  - Arrays/Lists
  - Boolean (Yes/No)
- **Customizable Behavior**:
  - Choose to hide or show matching files
  - Combine multiple filters with AND/OR logic

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Metadata Filter"
4. Install the plugin
5. Enable the plugin in your Community Plugins list

## Usage

### Creating Filters

1. Open Settings → Metadata Filter
2. Click "Add New Filter"
3. Configure your filter:
   - Enter the metadata key (e.g., "tags", "status", "priority")
   - Choose the operator (equals, contains, etc.)
   - Select the value type
   - Enter the value to match against

### Filter Behavior

- **Hide Matching Files**: When enabled, files that match your filters will be hidden. When disabled, only matching files will be shown.
- **Combine Filters with AND**: When enabled, files must match ALL filters to be affected. When disabled, files matching ANY filter will be affected.

### Quick Filtering

Right-click any file in the explorer to quickly create a filter based on its metadata.

## Examples

1. **Hide Completed Tasks**:
   - Key: "status"
   - Operator: "equals exactly"
   - Value Type: "text"
   - Value: "completed"

2. **Show High Priority Notes**:
   - Key: "priority"
   - Operator: "greater"
   - Value Type: "number"
   - Value: "3"

3. **Filter by Tag**:
   - Key: "tags"
   - Operator: "includes"
   - Value Type: "array"
   - Value: "project"

## Support

If you encounter any issues or have suggestions for improvements, please visit the [GitHub repository](https://github.com/shkarlsson/obsidian-metadata-filter) and create an issue.

## Credits

Created by shkarlsson with the help of aider.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
