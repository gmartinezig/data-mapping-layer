# Asana API Endpoints Explorer

A modern, responsive HTML/JavaScript application that displays all available endpoints from the Asana OpenAPI specification in an easy-to-browse interface.

## Features

- **Complete Endpoint Listing**: Displays all Asana API endpoints with detailed information
- **Personal Access Token (PAT) Integration**: Enter your Asana PAT to execute live API calls
- **Secure PAT Storage**: Automatically saves your PAT in browser's local storage for convenience
- **Live API Testing**: Execute safe GET endpoints directly from the interface
- **Connection Testing**: Validate your PAT and see your user information
- **Real-time Search**: Search endpoints by path, method, summary, description, or tags
- **Method Filtering**: Filter endpoints by HTTP method (GET, POST, PUT, PATCH, DELETE)
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Detailed Information**: Shows endpoint paths, methods, descriptions, tags, operation IDs, and security requirements
- **Live Statistics**: Real-time count of filtered endpoints and method breakdowns
- **API Response Viewer**: See formatted JSON responses directly in the interface

## Structure

```
data-mapping-layer/
├── index.html          # Main HTML file with styling
├── app.js             # JavaScript application logic
└── README.md          # This documentation file
```

## Usage

### Basic Usage
1. **Open the Application**: Simply open `index.html` in any modern web browser
2. **Browse Endpoints**: Scroll through the grid of endpoint cards
3. **Search**: Use the search box to find specific endpoints
4. **Filter**: Click method filter buttons to show only specific HTTP methods
5. **View Details**: Each card shows comprehensive endpoint information

### API Testing with Personal Access Token
1. **Get Your PAT**: Create a Personal Access Token in your Asana account settings
2. **Enter PAT**: Paste your token in the PAT input field at the top
3. **Auto-Save**: Your PAT is automatically saved in browser storage for future sessions
4. **Test Connection**: Click "Test Connection" to validate your token
5. **Execute Endpoints**: Click "Execute API Call" on supported endpoints to see live data
6. **View Responses**: See formatted JSON responses directly in the interface
7. **Clear PAT**: Use the "🗑️ Clear" button to remove stored PAT when needed

### Supported Endpoints for Live Testing
For security reasons, only safe GET endpoints are enabled for live execution:
- `/users/me` - Get your user information
- `/workspaces` - List your workspaces
- `/users` - List users in your organization
- `/teams` - List teams you have access to

## Endpoint Information Displayed

For each API endpoint, the application shows:

- **HTTP Method** (GET, POST, PUT, PATCH, DELETE) with color coding
- **Endpoint Path** in monospace font for clarity
- **Summary** - Brief description of what the endpoint does
- **Description** - Detailed explanation when available
- **Tags** - Categories for grouping related endpoints
- **Operation ID** - Unique identifier for the operation
- **Security Requirements** - Authentication/authorization needed

## API Categories Covered

The application displays endpoints from all major Asana API categories:

- **Access Requests** - Managing access to resources
- **Allocations** - Time and resource allocation
- **Attachments** - File attachments to tasks/projects
- **Audit Log API** - Audit trail and logging
- **Batch API** - Batch processing of requests
- **Custom Fields** - Custom data fields
- **Events** - Real-time event notifications
- **Goals** - Goal tracking and management
- **Jobs** - Background job monitoring
- **Memberships** - Team and project memberships
- **Portfolios** - Portfolio management
- **Projects** - Project operations
- **Tasks** - Task management (core functionality)
- **Teams** - Team organization
- **Users** - User account management
- **Workspaces** - Workspace administration
- **Webhooks** - Event webhook subscriptions

## Technical Implementation

### HTML Structure
- Semantic HTML5 with proper accessibility
- CSS Grid for responsive endpoint layout
- Flexbox for component alignment
- Mobile-first responsive design

### JavaScript Features
- ES6+ syntax with classes and modules
- Async/await for API loading
- Real-time filtering and search
- DOM manipulation for dynamic content
- Error handling with user feedback

### Styling
- Modern CSS with custom properties
- Gradient backgrounds and shadows
- Color-coded HTTP methods
- Smooth transitions and hover effects
- Mobile-responsive breakpoints

## Data Security & Privacy

### PAT Storage
- **Local Storage Only**: Your Personal Access Token is stored only in your browser's local storage
- **No Server Communication**: The PAT is never sent to any third-party servers (except Asana's official API)
- **Easy Removal**: Clear your stored PAT anytime with the "🗑️ Clear" button
- **Browser Isolation**: Each browser/device stores PATs independently

### Security Best Practices
- **Use Dedicated PATs**: Create a specific PAT for testing purposes only
- **Regular Rotation**: Rotate your PATs regularly as per Asana security guidelines
- **Shared Device Warning**: Always clear your PAT when using shared or public devices
- **Limited Scope**: The app only executes read-only operations for safety

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

To extend or modify the application:

1. **Add New Endpoints**: Extend the `createSampleEndpoints()` method in `app.js`
2. **Modify Styling**: Update CSS in the `<style>` section of `index.html`
3. **Add Features**: Extend the `AsanaAPIExplorer` class with new methods
4. **Improve Parsing**: Enhance the `parseYAMLSpec()` method for better OpenAPI parsing

## Data Source

The application attempts to load the official Asana OpenAPI specification from:
`https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml`

If the external load fails, it falls back to a comprehensive set of sample endpoints covering all major API categories.

## Future Enhancements

Potential improvements could include:

- Interactive API testing capabilities
- Code example generation
- Export functionality for endpoint lists
- Advanced filtering by tags or categories
- Endpoint comparison features
- Dark/light theme toggle
- Bookmarking favorite endpoints

## License

This project is intended for educational and development purposes. Please refer to Asana's official API documentation and terms of service for production usage guidelines.# data-mapping-layer
