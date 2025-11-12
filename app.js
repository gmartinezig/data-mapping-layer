class AsanaAPIExplorer {
    constructor() {
        this.endpoints = [];
        this.filteredEndpoints = [];
        this.currentMethodFilter = 'all';
        this.searchTerm = '';
        this.personalAccessToken = '';
        this.isTokenValid = false;
        this.baseUrl = 'https://app.asana.com/api/1.0';
        this.storageKey = 'asana-api-explorer-pat';
        
        // Sequence management
        this.apiSequence = [];
        this.sequenceResults = new Map(); // Store results from previous calls
        this.sequencePanelOpen = false;
        this.currentSequenceItem = null; // Current item being executed
        
        // Panel resize management
        this.panelWidthStorageKey = 'asana-api-explorer-panel-width';
        this.defaultPanelWidth = 400;
        this.minPanelWidth = 300;
        this.maxPanelWidth = window.innerWidth * 0.8;
        this.currentPanelWidth = this.defaultPanelWidth;
        this.isResizing = false;

        // Data transformation management
        this.dataTransformations = {
            fieldMappings: [], // [{ sourceField: '', targetField: '', isUnified: false }]
            unifiedColumns: [] // [{ name: '', formatTemplate: '', sourceFields: [] }]
        };
        this.transformedData = null;
        
        this.loadPATFromStorage();
        this.loadPanelWidth();
        this.init();
    }

    async init() {
        try {
            await this.loadAsanaAPISpec();
            this.setupEventListeners();
            this.setupPanelResize();
            this.restorePATToInput();
            this.renderEndpoints();
            this.updateStats();
            
            // Apply panel width after everything is set up
            setTimeout(() => {
                this.applyPanelWidth();
            }, 100);
        } catch (error) {
            this.showError('Failed to load Asana API specification: ' + error.message);
        }
    }

    async loadAsanaAPISpec() {
        try {
            // Load the Asana OpenAPI specification
            const response = await fetch('https://raw.githubusercontent.com/Asana/openapi/master/defs/asana_oas.yaml');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const yamlText = await response.text();
            
            // Parse YAML to extract endpoints
            this.parseYAMLSpec(yamlText);
            
            // If we didn't get enough endpoints, add comprehensive sample data
            if (this.endpoints.length < 50) {
                console.log(`Only found ${this.endpoints.length} endpoints from parsing, adding comprehensive sample data`);
                this.createComprehensiveEndpoints();
            }
        } catch (error) {
            console.warn('Failed to load OpenAPI spec:', error);
            // Fallback: create comprehensive endpoints
            this.createComprehensiveEndpoints();
        }
    }

    parseYAMLSpec(yamlText) {
        // Enhanced YAML parser for paths section
        const lines = yamlText.split('\n');
        let inPaths = false;
        let currentPath = '';
        let currentMethod = '';
        let currentEndpoint = null;
        let pathIndent = 0;
        let methodIndent = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const lineIndent = line.length - line.trimLeft().length;
            
            // Find the paths section
            if (trimmed === 'paths:') {
                inPaths = true;
                continue;
            }
            
            if (!inPaths) continue;
            
            // Stop if we hit another top-level section (no indentation)
            if (lineIndent === 0 && trimmed && !trimmed.startsWith('/')) {
                inPaths = false;
                break;
            }
            
            // Path definition (starts with / and ends with :)
            if (trimmed.startsWith('/') && trimmed.endsWith(':') && lineIndent >= 2) {
                // Save previous endpoint if exists
                if (currentEndpoint && currentEndpoint.path && currentEndpoint.method) {
                    this.endpoints.push({ ...currentEndpoint });
                }
                
                currentPath = trimmed.slice(0, -1);
                pathIndent = lineIndent;
                currentEndpoint = null;
                continue;
            }
            
            // HTTP method (must be under a path)
            if (currentPath && ['get:', 'post:', 'put:', 'patch:', 'delete:', 'head:', 'options:'].includes(trimmed) && lineIndent > pathIndent) {
                // Save previous endpoint if exists
                if (currentEndpoint && currentEndpoint.path && currentEndpoint.method) {
                    this.endpoints.push({ ...currentEndpoint });
                }
                
                currentMethod = trimmed.slice(0, -1).toUpperCase();
                methodIndent = lineIndent;
                currentEndpoint = {
                    path: currentPath,
                    method: currentMethod,
                    summary: '',
                    description: '',
                    tags: [],
                    operationId: '',
                    security: []
                };
                continue;
            }
            
            // Extract endpoint details (must be under a method)
            if (currentEndpoint && lineIndent > methodIndent) {
                if (trimmed.startsWith('summary:')) {
                    const summary = trimmed.replace('summary:', '').trim();
                    if (summary.startsWith('"') && summary.endsWith('"')) {
                        currentEndpoint.summary = summary.slice(1, -1);
                    } else if (summary.startsWith("'") && summary.endsWith("'")) {
                        currentEndpoint.summary = summary.slice(1, -1);
                    } else {
                        currentEndpoint.summary = summary;
                    }
                } else if (trimmed.startsWith('description:')) {
                    let desc = trimmed.replace('description:', '').trim();
                    
                    // Handle quoted descriptions
                    if (desc.startsWith('"') || desc.startsWith("'")) {
                        const quote = desc[0];
                        desc = desc.slice(1);
                        if (desc.endsWith(quote)) {
                            desc = desc.slice(0, -1);
                        }
                    }
                    
                    // Handle multi-line descriptions
                    if (desc === '|-' || desc === '|' || desc === '>-' || desc === '>') {
                        desc = '';
                        let j = i + 1;
                        while (j < lines.length && lines[j] && lines[j].length - lines[j].trimLeft().length > lineIndent) {
                            const descLine = lines[j].trim();
                            if (descLine) {
                                desc += (desc ? ' ' : '') + descLine;
                            }
                            j++;
                        }
                        i = j - 1; // Skip processed lines
                    }
                    
                    currentEndpoint.description = desc;
                } else if (trimmed.startsWith('operationId:')) {
                    currentEndpoint.operationId = trimmed.replace('operationId:', '').trim();
                } else if (trimmed === 'tags:') {
                    // Handle tags array
                    let j = i + 1;
                    while (j < lines.length && lines[j] && lines[j].length - lines[j].trimLeft().length > lineIndent) {
                        const tagLine = lines[j].trim();
                        if (tagLine.startsWith('- ')) {
                            currentEndpoint.tags.push(tagLine.substring(2).trim());
                        }
                        j++;
                    }
                    i = j - 1; // Skip processed lines
                }
            }
        }
        
        // Add the last endpoint if exists
        if (currentEndpoint && currentEndpoint.path && currentEndpoint.method) {
            this.endpoints.push(currentEndpoint);
        }
        
        console.log(`Parsed ${this.endpoints.length} endpoints from OpenAPI spec`);
    }

    createComprehensiveEndpoints() {
        // Create comprehensive sample endpoints based on the Asana API
        this.endpoints = [
            // Access Requests
            {
                path: '/access_requests',
                method: 'GET',
                summary: 'Get access requests',
                description: 'Returns the pending access requests for a target object or a target object filtered by user.',
                tags: ['Access requests'],
                operationId: 'getAccessRequests',
                security: ['oauth2']
            },
            {
                path: '/access_requests',
                method: 'POST',
                summary: 'Create an access request',
                description: 'Creates an access request for the specified target object.',
                tags: ['Access requests'],
                operationId: 'createAccessRequest',
                security: ['oauth2']
            },
            {
                path: '/access_requests/{access_request_gid}/approve',
                method: 'POST',
                summary: 'Approve an access request',
                description: 'Approves the specified access request.',
                tags: ['Access requests'],
                operationId: 'approveAccessRequest',
                security: ['oauth2']
            },
            {
                path: '/access_requests/{access_request_gid}/reject',
                method: 'POST',
                summary: 'Reject an access request',
                description: 'Rejects the specified access request.',
                tags: ['Access requests'],
                operationId: 'rejectAccessRequest',
                security: ['oauth2']
            },

            // Allocations
            {
                path: '/allocations/{allocation_gid}',
                method: 'GET',
                summary: 'Get an allocation',
                description: 'Returns the complete allocation record for a single allocation.',
                tags: ['Allocations'],
                operationId: 'getAllocation',
                security: ['oauth2']
            },
            {
                path: '/allocations/{allocation_gid}',
                method: 'PUT',
                summary: 'Update an allocation',
                description: 'Updates the allocation and returns the updated allocation record.',
                tags: ['Allocations'],
                operationId: 'updateAllocation',
                security: ['oauth2']
            },
            {
                path: '/allocations/{allocation_gid}',
                method: 'DELETE',
                summary: 'Delete an allocation',
                description: 'Deletes the allocation.',
                tags: ['Allocations'],
                operationId: 'deleteAllocation',
                security: ['oauth2']
            },
            {
                path: '/allocations',
                method: 'GET',
                summary: 'Get multiple allocations',
                description: 'Returns the compact allocation records for some filtered set of allocations.',
                tags: ['Allocations'],
                operationId: 'getAllocations',
                security: ['oauth2']
            },
            {
                path: '/allocations',
                method: 'POST',
                summary: 'Create an allocation',
                description: 'Creates a new allocation and returns the created allocation record.',
                tags: ['Allocations'],
                operationId: 'createAllocation',
                security: ['oauth2']
            },

            // Attachments
            {
                path: '/attachments/{attachment_gid}',
                method: 'GET',
                summary: 'Get an attachment',
                description: 'Returns the full record for a single attachment.',
                tags: ['Attachments'],
                operationId: 'getAttachment',
                security: ['oauth2']
            },
            {
                path: '/attachments/{attachment_gid}',
                method: 'DELETE',
                summary: 'Delete an attachment',
                description: 'Deletes a specific, existing attachment.',
                tags: ['Attachments'],
                operationId: 'deleteAttachment',
                security: ['oauth2']
            },
            {
                path: '/attachments',
                method: 'GET',
                summary: 'Get attachments from an object',
                description: 'Returns the compact records for attachments on an object.',
                tags: ['Attachments'],
                operationId: 'getAttachmentsForObject',
                security: ['oauth2']
            },
            {
                path: '/attachments',
                method: 'POST',
                summary: 'Create an attachment',
                description: 'Creates an attachment by uploading a file and attaching it to the specified parent.',
                tags: ['Attachments'],
                operationId: 'createAttachmentForObject',
                security: ['oauth2']
            },

            // Audit Log API
            {
                path: '/workspaces/{workspace_gid}/audit_log_events',
                method: 'GET',
                summary: 'Get audit log events',
                description: 'Retrieve the audit log events that have been captured in your domain.',
                tags: ['Audit log API'],
                operationId: 'getAuditLogEvents',
                security: ['oauth2']
            },

            // Batch API
            {
                path: '/batch',
                method: 'POST',
                summary: 'Submit parallel requests',
                description: 'Make multiple API requests in parallel.',
                tags: ['Batch API'],
                operationId: 'createBatchRequest',
                security: ['oauth2']
            },

            // Custom Fields
            {
                path: '/custom_fields/{custom_field_gid}',
                method: 'GET',
                summary: 'Get a custom field',
                description: 'Returns the complete definition of a custom field\'s metadata.',
                tags: ['Custom fields'],
                operationId: 'getCustomField',
                security: ['oauth2']
            },
            {
                path: '/custom_fields/{custom_field_gid}',
                method: 'PUT',
                summary: 'Update a custom field',
                description: 'Updates a custom field\'s metadata and returns the updated custom field.',
                tags: ['Custom fields'],
                operationId: 'updateCustomField',
                security: ['oauth2']
            },
            {
                path: '/custom_fields/{custom_field_gid}',
                method: 'DELETE',
                summary: 'Delete a custom field',
                description: 'A specific, existing custom field can be deleted by making a DELETE request.',
                tags: ['Custom fields'],
                operationId: 'deleteCustomField',
                security: ['oauth2']
            },
            {
                path: '/custom_fields',
                method: 'GET',
                summary: 'Get multiple custom fields',
                description: 'Returns a list of the compact representation of all of the custom fields in a workspace.',
                tags: ['Custom fields'],
                operationId: 'getCustomFields',
                security: ['oauth2']
            },
            {
                path: '/custom_fields',
                method: 'POST',
                summary: 'Create a custom field',
                description: 'Creates a new custom field in a workspace.',
                tags: ['Custom fields'],
                operationId: 'createCustomField',
                security: ['oauth2']
            },

            // Events
            {
                path: '/events',
                method: 'GET',
                summary: 'Get events on a resource',
                description: 'Returns the full record for all events that have occurred since the sync token was created.',
                tags: ['Events'],
                operationId: 'getEvents',
                security: ['oauth2']
            },

            // Goals
            {
                path: '/goals/{goal_gid}',
                method: 'GET',
                summary: 'Get a goal',
                description: 'Returns the complete goal record for a single goal.',
                tags: ['Goals'],
                operationId: 'getGoal',
                security: ['oauth2']
            },
            {
                path: '/goals/{goal_gid}',
                method: 'PUT',
                summary: 'Update a goal',
                description: 'Updates the goal and returns the updated goal record.',
                tags: ['Goals'],
                operationId: 'updateGoal',
                security: ['oauth2']
            },
            {
                path: '/goals/{goal_gid}',
                method: 'DELETE',
                summary: 'Delete a goal',
                description: 'Deletes the goal.',
                tags: ['Goals'],
                operationId: 'deleteGoal',
                security: ['oauth2']
            },

            // Jobs
            {
                path: '/jobs/{job_gid}',
                method: 'GET',
                summary: 'Get a job by id',
                description: 'Returns the full record for a job.',
                tags: ['Jobs'],
                operationId: 'getJob',
                security: ['oauth2']
            },

            // Memberships
            {
                path: '/memberships',
                method: 'GET',
                summary: 'Get multiple memberships',
                description: 'Returns the compact membership records for the project or team.',
                tags: ['Memberships'],
                operationId: 'getMemberships',
                security: ['oauth2']
            },
            {
                path: '/memberships',
                method: 'POST',
                summary: 'Create a membership',
                description: 'Creates a new membership and returns the membership record.',
                tags: ['Memberships'],
                operationId: 'createMembership',
                security: ['oauth2']
            },
            {
                path: '/memberships/{membership_gid}',
                method: 'GET',
                summary: 'Get a membership',
                description: 'Returns the complete membership record for a single membership.',
                tags: ['Memberships'],
                operationId: 'getMembership',
                security: ['oauth2']
            },
            {
                path: '/memberships/{membership_gid}',
                method: 'PUT',
                summary: 'Update a membership',
                description: 'Updates the membership and returns the updated membership record.',
                tags: ['Memberships'],
                operationId: 'updateMembership',
                security: ['oauth2']
            },
            {
                path: '/memberships/{membership_gid}',
                method: 'DELETE',
                summary: 'Delete a membership',
                description: 'Deletes the membership.',
                tags: ['Memberships'],
                operationId: 'deleteMembership',
                security: ['oauth2']
            },

            // Portfolios
            {
                path: '/portfolios',
                method: 'GET',
                summary: 'Get multiple portfolios',
                description: 'Returns a list of the portfolios in compact representation that are owned by the current API user.',
                tags: ['Portfolios'],
                operationId: 'getPortfolios',
                security: ['oauth2']
            },
            {
                path: '/portfolios',
                method: 'POST',
                summary: 'Create a portfolio',
                description: 'Creates a new portfolio and returns the created portfolio record.',
                tags: ['Portfolios'],
                operationId: 'createPortfolio',
                security: ['oauth2']
            },
            {
                path: '/portfolios/{portfolio_gid}',
                method: 'GET',
                summary: 'Get a portfolio',
                description: 'Returns the complete portfolio record for a single portfolio.',
                tags: ['Portfolios'],
                operationId: 'getPortfolio',
                security: ['oauth2']
            },
            {
                path: '/portfolios/{portfolio_gid}',
                method: 'PUT',
                summary: 'Update a portfolio',
                description: 'Updates the portfolio and returns the updated portfolio record.',
                tags: ['Portfolios'],
                operationId: 'updatePortfolio',
                security: ['oauth2']
            },
            {
                path: '/portfolios/{portfolio_gid}',
                method: 'DELETE',
                summary: 'Delete a portfolio',
                description: 'Deletes the portfolio.',
                tags: ['Portfolios'],
                operationId: 'deletePortfolio',
                security: ['oauth2']
            },

            // Projects
            {
                path: '/projects',
                method: 'GET',
                summary: 'Get multiple projects',
                description: 'Returns the compact project records for some filtered set of projects.',
                tags: ['Projects'],
                operationId: 'getProjects',
                security: ['oauth2']
            },
            {
                path: '/projects',
                method: 'POST',
                summary: 'Create a project',
                description: 'Creates a new project and returns the created project record.',
                tags: ['Projects'],
                operationId: 'createProject',
                security: ['oauth2']
            },
            {
                path: '/projects/{project_gid}',
                method: 'GET',
                summary: 'Get a project',
                description: 'Returns the complete project record for a single project.',
                tags: ['Projects'],
                operationId: 'getProject',
                security: ['oauth2']
            },
            {
                path: '/projects/{project_gid}',
                method: 'PUT',
                summary: 'Update a project',
                description: 'Updates the project and returns the updated project record.',
                tags: ['Projects'],
                operationId: 'updateProject',
                security: ['oauth2']
            },
            {
                path: '/projects/{project_gid}',
                method: 'DELETE',
                summary: 'Delete a project',
                description: 'Deletes the project.',
                tags: ['Projects'],
                operationId: 'deleteProject',
                security: ['oauth2']
            },

            // Tasks
            {
                path: '/tasks',
                method: 'GET',
                summary: 'Get multiple tasks',
                description: 'Returns the compact task records for some filtered set of tasks.',
                tags: ['Tasks'],
                operationId: 'getTasks',
                security: ['oauth2']
            },
            {
                path: '/tasks',
                method: 'POST',
                summary: 'Create a task',
                description: 'Creates a new task and returns the created task record.',
                tags: ['Tasks'],
                operationId: 'createTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}',
                method: 'GET',
                summary: 'Get a task',
                description: 'Returns the complete task record for a single task.',
                tags: ['Tasks'],
                operationId: 'getTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}',
                method: 'PUT',
                summary: 'Update a task',
                description: 'Updates the task and returns the updated task record.',
                tags: ['Tasks'],
                operationId: 'updateTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}',
                method: 'DELETE',
                summary: 'Delete a task',
                description: 'Deletes the task.',
                tags: ['Tasks'],
                operationId: 'deleteTask',
                security: ['oauth2']
            },

            // Teams
            {
                path: '/teams',
                method: 'GET',
                summary: 'Get teams in an organization',
                description: 'Returns the compact records for all teams in the organization visible to the requesting user.',
                tags: ['Teams'],
                operationId: 'getTeams',
                security: ['oauth2']
            },
            {
                path: '/teams/{team_gid}',
                method: 'GET',
                summary: 'Get a team',
                description: 'Returns the complete team record for a single team.',
                tags: ['Teams'],
                operationId: 'getTeam',
                security: ['oauth2']
            },

            // Users
            {
                path: '/users',
                method: 'GET',
                summary: 'Get multiple users',
                description: 'Returns the user records for all users in all workspaces and organizations accessible to the authenticated user.',
                tags: ['Users'],
                operationId: 'getUsers',
                security: ['oauth2']
            },
            {
                path: '/users/{user_gid}',
                method: 'GET',
                summary: 'Get a user',
                description: 'Returns the complete user record for a single user.',
                tags: ['Users'],
                operationId: 'getUser',
                security: ['oauth2']
            },
            {
                path: '/users/me',
                method: 'GET',
                summary: 'Get current user',
                description: 'Returns the complete user record for the currently authenticated user.',
                tags: ['Users'],
                operationId: 'getMe',
                security: ['oauth2']
            },

            // Workspaces
            {
                path: '/workspaces',
                method: 'GET',
                summary: 'Get multiple workspaces',
                description: 'Returns the compact records for all workspaces visible to the authenticated user.',
                tags: ['Workspaces'],
                operationId: 'getWorkspaces',
                security: ['oauth2']
            },
            {
                path: '/workspaces/{workspace_gid}',
                method: 'GET',
                summary: 'Get a workspace',
                description: 'Returns the complete workspace record for a single workspace.',
                tags: ['Workspaces'],
                operationId: 'getWorkspace',
                security: ['oauth2']
            },
            {
                path: '/workspaces/{workspace_gid}',
                method: 'PUT',
                summary: 'Update a workspace',
                description: 'Updates the workspace and returns the updated workspace record.',
                tags: ['Workspaces'],
                operationId: 'updateWorkspace',
                security: ['oauth2']
            },

            // Webhooks
            {
                path: '/webhooks',
                method: 'GET',
                summary: 'Get multiple webhooks',
                description: 'Returns the compact representation of all webhooks your app has registered for the authenticated user.',
                tags: ['Webhooks'],
                operationId: 'getWebhooks',
                security: ['oauth2']
            },
            {
                path: '/webhooks',
                method: 'POST',
                summary: 'Establish a webhook',
                description: 'Establishing a webhook is a two-part process.',
                tags: ['Webhooks'],
                operationId: 'createWebhook',
                security: ['oauth2']
            },
            {
                path: '/webhooks/{webhook_gid}',
                method: 'GET',
                summary: 'Get a webhook',
                description: 'Returns the full record for the given webhook.',
                tags: ['Webhooks'],
                operationId: 'getWebhook',
                security: ['oauth2']
            },
            {
                path: '/webhooks/{webhook_gid}',
                method: 'PUT',
                summary: 'Update a webhook',
                description: 'Updates the webhook and returns the updated webhook record.',
                tags: ['Webhooks'],
                operationId: 'updateWebhook',
                security: ['oauth2']
            },
            {
                path: '/webhooks/{webhook_gid}',
                method: 'DELETE',
                summary: 'Delete a webhook',
                description: 'Deletes the webhook.',
                tags: ['Webhooks'],
                operationId: 'deleteWebhook',
                security: ['oauth2']
            },

            // Additional comprehensive endpoints
            
            // Stories
            {
                path: '/stories/{story_gid}',
                method: 'GET',
                summary: 'Get a story',
                description: 'Returns the full record for a single story.',
                tags: ['Stories'],
                operationId: 'getStory',
                security: ['oauth2']
            },
            {
                path: '/stories/{story_gid}',
                method: 'PUT',
                summary: 'Update a story',
                description: 'Updates the story and returns the complete updated story record.',
                tags: ['Stories'],
                operationId: 'updateStory',
                security: ['oauth2']
            },
            {
                path: '/stories/{story_gid}',
                method: 'DELETE',
                summary: 'Delete a story',
                description: 'Deletes the story.',
                tags: ['Stories'],
                operationId: 'deleteStory',
                security: ['oauth2']
            },

            // Sections
            {
                path: '/sections',
                method: 'POST',
                summary: 'Create a section',
                description: 'Creates a new section and returns the created section record.',
                tags: ['Sections'],
                operationId: 'createSection',
                security: ['oauth2']
            },
            {
                path: '/sections/{section_gid}',
                method: 'GET',
                summary: 'Get a section',
                description: 'Returns the complete section record for a single section.',
                tags: ['Sections'],
                operationId: 'getSection',
                security: ['oauth2']
            },
            {
                path: '/sections/{section_gid}',
                method: 'PUT',
                summary: 'Update a section',
                description: 'Updates the section and returns the updated section record.',
                tags: ['Sections'],
                operationId: 'updateSection',
                security: ['oauth2']
            },
            {
                path: '/sections/{section_gid}',
                method: 'DELETE',
                summary: 'Delete a section',
                description: 'Deletes the section.',
                tags: ['Sections'],
                operationId: 'deleteSection',
                security: ['oauth2']
            },
            {
                path: '/projects/{project_gid}/sections',
                method: 'GET',
                summary: 'Get sections in a project',
                description: 'Returns the compact records for all sections in the specified project.',
                tags: ['Sections'],
                operationId: 'getSectionsForProject',
                security: ['oauth2']
            },

            // Task Dependencies
            {
                path: '/tasks/{task_gid}/dependencies',
                method: 'GET',
                summary: 'Get dependencies from a task',
                description: 'Returns the dependencies of a task.',
                tags: ['Tasks', 'Dependencies'],
                operationId: 'getDependenciesForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/dependents',
                method: 'GET',
                summary: 'Get dependents from a task',
                description: 'Returns the dependents of a task.',
                tags: ['Tasks', 'Dependencies'],
                operationId: 'getDependentsForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/addDependencies',
                method: 'POST',
                summary: 'Set dependencies for a task',
                description: 'Marks a set of tasks as dependencies of this task.',
                tags: ['Tasks', 'Dependencies'],
                operationId: 'addDependenciesForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/removeDependencies',
                method: 'POST',
                summary: 'Unlink dependencies from a task',
                description: 'Unlinks a set of dependencies from this task.',
                tags: ['Tasks', 'Dependencies'],
                operationId: 'removeDependenciesForTask',
                security: ['oauth2']
            },

            // Task Followers
            {
                path: '/tasks/{task_gid}/addFollowers',
                method: 'POST',
                summary: 'Add followers to a task',
                description: 'Adds followers to a task.',
                tags: ['Tasks', 'Followers'],
                operationId: 'addFollowersForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/removeFollowers',
                method: 'POST',
                summary: 'Remove followers from a task',
                description: 'Removes followers from a task.',
                tags: ['Tasks', 'Followers'],
                operationId: 'removeFollowersForTask',
                security: ['oauth2']
            },

            // Task Projects
            {
                path: '/tasks/{task_gid}/addProject',
                method: 'POST',
                summary: 'Add a project to a task',
                description: 'Adds the task to the specified project.',
                tags: ['Tasks', 'Projects'],
                operationId: 'addProjectForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/removeProject',
                method: 'POST',
                summary: 'Remove a project from a task',
                description: 'Removes the task from the specified project.',
                tags: ['Tasks', 'Projects'],
                operationId: 'removeProjectForTask',
                security: ['oauth2']
            },

            // Subtasks
            {
                path: '/tasks/{task_gid}/subtasks',
                method: 'GET',
                summary: 'Get subtasks from a task',
                description: 'Returns a compact representation of all the subtasks of a task.',
                tags: ['Tasks', 'Subtasks'],
                operationId: 'getSubtasksForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/subtasks',
                method: 'POST',
                summary: 'Create a subtask',
                description: 'Creates a new subtask and adds it to the parent task.',
                tags: ['Tasks', 'Subtasks'],
                operationId: 'createSubtaskForTask',
                security: ['oauth2']
            },

            // Time Tracking
            {
                path: '/tasks/{task_gid}/time_tracking_entries',
                method: 'GET',
                summary: 'Get time tracking entries from a task',
                description: 'Returns time tracking entries from a task.',
                tags: ['Time tracking entries'],
                operationId: 'getTimeTrackingEntriesForTask',
                security: ['oauth2']
            },
            {
                path: '/tasks/{task_gid}/time_tracking_entries',
                method: 'POST',
                summary: 'Create a time tracking entry',
                description: 'Creates a time tracking entry on a task.',
                tags: ['Time tracking entries'],
                operationId: 'createTimeTrackingEntry',
                security: ['oauth2']
            },
            {
                path: '/time_tracking_entries/{time_tracking_entry_gid}',
                method: 'GET',
                summary: 'Get a time tracking entry',
                description: 'Returns the complete time tracking entry record for a single time tracking entry.',
                tags: ['Time tracking entries'],
                operationId: 'getTimeTrackingEntry',
                security: ['oauth2']
            },
            {
                path: '/time_tracking_entries/{time_tracking_entry_gid}',
                method: 'PUT',
                summary: 'Update a time tracking entry',
                description: 'Updates the time tracking entry and returns the updated record.',
                tags: ['Time tracking entries'],
                operationId: 'updateTimeTrackingEntry',
                security: ['oauth2']
            },
            {
                path: '/time_tracking_entries/{time_tracking_entry_gid}',
                method: 'DELETE',
                summary: 'Delete a time tracking entry',
                description: 'Deletes the time tracking entry.',
                tags: ['Time tracking entries'],
                operationId: 'deleteTimeTrackingEntry',
                security: ['oauth2']
            },

            // Status Updates
            {
                path: '/status_updates',
                method: 'POST',
                summary: 'Create a status update',
                description: 'Creates a new status update and returns the created status update record.',
                tags: ['Status updates'],
                operationId: 'createStatusUpdate',
                security: ['oauth2']
            },
            {
                path: '/status_updates/{status_update_gid}',
                method: 'GET',
                summary: 'Get a status update',
                description: 'Returns the complete status update record for a single status update.',
                tags: ['Status updates'],
                operationId: 'getStatusUpdate',
                security: ['oauth2']
            },
            {
                path: '/status_updates/{status_update_gid}',
                method: 'PUT',
                summary: 'Update a status update',
                description: 'Updates the status update and returns the updated status update record.',
                tags: ['Status updates'],
                operationId: 'updateStatusUpdate',
                security: ['oauth2']
            },
            {
                path: '/status_updates/{status_update_gid}',
                method: 'DELETE',
                summary: 'Delete a status update',
                description: 'Deletes the status update.',
                tags: ['Status updates'],
                operationId: 'deleteStatusUpdate',
                security: ['oauth2']
            },

            // Tags
            {
                path: '/tags',
                method: 'GET',
                summary: 'Get multiple tags',
                description: 'Returns the compact tag records for some filtered set of tags.',
                tags: ['Tags'],
                operationId: 'getTags',
                security: ['oauth2']
            },
            {
                path: '/tags',
                method: 'POST',
                summary: 'Create a tag',
                description: 'Creates a new tag and returns the created tag record.',
                tags: ['Tags'],
                operationId: 'createTag',
                security: ['oauth2']
            },
            {
                path: '/tags/{tag_gid}',
                method: 'GET',
                summary: 'Get a tag',
                description: 'Returns the complete tag record for a single tag.',
                tags: ['Tags'],
                operationId: 'getTag',
                security: ['oauth2']
            },
            {
                path: '/tags/{tag_gid}',
                method: 'PUT',
                summary: 'Update a tag',
                description: 'Updates the tag and returns the updated tag record.',
                tags: ['Tags'],
                operationId: 'updateTag',
                security: ['oauth2']
            },
            {
                path: '/tags/{tag_gid}',
                method: 'DELETE',
                summary: 'Delete a tag',
                description: 'Deletes the tag.',
                tags: ['Tags'],
                operationId: 'deleteTag',
                security: ['oauth2']
            },

            // Typeahead
            {
                path: '/workspaces/{workspace_gid}/typeahead',
                method: 'GET',
                summary: 'Get objects via typeahead',
                description: 'Retrieves objects in the workspace based on an auto-completion/typeahead search algorithm.',
                tags: ['Typeahead'],
                operationId: 'typeaheadForWorkspace',
                security: ['oauth2']
            },

            // Organization Exports
            {
                path: '/organization_exports',
                method: 'POST',
                summary: 'Create an organization export',
                description: 'Creates an organization export request and returns the created organization export record.',
                tags: ['Organization exports'],
                operationId: 'createOrganizationExport',
                security: ['oauth2']
            },
            {
                path: '/organization_exports/{organization_export_gid}',
                method: 'GET',
                summary: 'Get details on an organization export',
                description: 'Returns details of a previously-requested organization export.',
                tags: ['Organization exports'],
                operationId: 'getOrganizationExport',
                security: ['oauth2']
            },

            // Project Templates
            {
                path: '/project_templates/{project_template_gid}/instantiateProject',
                method: 'POST',
                summary: 'Instantiate a project from a project template',
                description: 'Creates and returns a job that will asynchronously handle the project instantiation.',
                tags: ['Project templates'],
                operationId: 'instantiateProject',
                security: ['oauth2']
            },
            {
                path: '/teams/{team_gid}/project_templates',
                method: 'GET',
                summary: 'Get a team\'s project templates',
                description: 'Returns the compact project template records for all project templates in the team.',
                tags: ['Project templates'],
                operationId: 'getProjectTemplatesForTeam',
                security: ['oauth2']
            },

            // Project Status Updates
            {
                path: '/projects/{project_gid}/project_statuses',
                method: 'GET',
                summary: 'Get statuses from a project',
                description: 'Returns the compact project status update records for all updates on the project.',
                tags: ['Project status updates'],
                operationId: 'getProjectStatusesForProject',
                security: ['oauth2']
            },
            {
                path: '/projects/{project_gid}/project_statuses',
                method: 'POST',
                summary: 'Create a project status',
                description: 'Creates a new status update and returns the created status update record.',
                tags: ['Project status updates'],
                operationId: 'createProjectStatusForProject',
                security: ['oauth2']
            },

            // Rules
            {
                path: '/rules/{rule_gid}/trigger',
                method: 'POST',
                summary: 'Trigger a rule',
                description: 'Triggers a rule which uses an "inbox" trigger.',
                tags: ['Rules'],
                operationId: 'triggerRule',
                security: ['oauth2']
            },

            // Search
            {
                path: '/workspaces/{workspace_gid}/search',
                method: 'GET',
                summary: 'Search in a workspace',
                description: 'Searches for objects in a workspace.',
                tags: ['Search'],
                operationId: 'searchInWorkspace',
                security: ['oauth2']
            },

            // User Task Lists
            {
                path: '/user_task_lists/{user_task_list_gid}',
                method: 'GET',
                summary: 'Get a user task list',
                description: 'Returns the complete user task list record for a single user task list.',
                tags: ['User task lists'],
                operationId: 'getUserTaskList',
                security: ['oauth2']
            },
            {
                path: '/users/{user_gid}/user_task_list',
                method: 'GET',
                summary: 'Get a user\'s task list',
                description: 'Returns the complete user task list record for a user\'s My Tasks.',
                tags: ['User task lists'],
                operationId: 'getUserTaskListForUser',
                security: ['oauth2']
            },

            // Workspace Memberships
            {
                path: '/workspace_memberships',
                method: 'GET',
                summary: 'Get multiple workspace memberships',
                description: 'Returns the compact workspace membership records.',
                tags: ['Workspace memberships'],
                operationId: 'getWorkspaceMemberships',
                security: ['oauth2']
            },
            {
                path: '/workspace_memberships/{workspace_membership_gid}',
                method: 'GET',
                summary: 'Get a workspace membership',
                description: 'Returns the complete workspace membership record for a single workspace membership.',
                tags: ['Workspace memberships'],
                operationId: 'getWorkspaceMembership',
                security: ['oauth2']
            }
        ];
        
        console.log(`Created ${this.endpoints.length} comprehensive sample endpoints`);
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.filterAndRenderEndpoints();
        });

        // Method filter buttons
        const filterButtons = document.querySelectorAll('.method-filter');
        filterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                // Update active state
                filterButtons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                // Update filter
                this.currentMethodFilter = e.target.dataset.method;
                this.filterAndRenderEndpoints();
            });
        });

        // PAT input and controls
        const patInput = document.getElementById('patInput');
        const togglePat = document.getElementById('togglePat');
        const testConnection = document.getElementById('testConnection');
        const clearPat = document.getElementById('clearPat');

        // PAT input change
        patInput.addEventListener('input', (e) => {
            this.personalAccessToken = e.target.value.trim();
            this.isTokenValid = false;
            this.updatePatStatus('', '');
            this.savePATToStorage();
            this.renderEndpoints(); // Re-render to update execute buttons
            this.updateExecuteButtonStatus(); // Update sequence execute button
        });

        // Toggle PAT visibility
        togglePat.addEventListener('click', () => {
            if (patInput.type === 'password') {
                patInput.type = 'text';
                togglePat.textContent = '🙈';
            } else {
                patInput.type = 'password';
                togglePat.textContent = '👁️';
            }
        });

        // Test connection
        testConnection.addEventListener('click', () => {
            this.testConnection();
        });

        // Clear PAT
        clearPat.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the stored PAT?')) {
                this.clearStoredPAT();
            }
        });
    }

    filterAndRenderEndpoints() {
        this.filteredEndpoints = this.endpoints.filter(endpoint => {
            // Method filter
            const methodMatch = this.currentMethodFilter === 'all' || 
                               endpoint.method.toLowerCase() === this.currentMethodFilter;
            
            // Search filter
            const searchMatch = !this.searchTerm || 
                              endpoint.path.toLowerCase().includes(this.searchTerm) ||
                              endpoint.method.toLowerCase().includes(this.searchTerm) ||
                              endpoint.summary.toLowerCase().includes(this.searchTerm) ||
                              endpoint.description.toLowerCase().includes(this.searchTerm) ||
                              endpoint.tags.some(tag => tag.toLowerCase().includes(this.searchTerm));
            
            return methodMatch && searchMatch;
        });

        this.renderEndpoints();
        this.updateStats();
    }

    renderEndpoints() {
        const container = document.getElementById('endpointsContainer');
        
        if (this.filteredEndpoints.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6c757d;">
                    <h3>No endpoints found</h3>
                    <p>Try adjusting your search terms or filters.</p>
                </div>
            `;
            return;
        }

        const endpointsHTML = this.filteredEndpoints.map((endpoint, index) => `
            <div class="endpoint-card">
                <div class="endpoint-header">
                    <div class="endpoint-method method-${endpoint.method.toLowerCase()}">${endpoint.method}</div>
                    <div class="endpoint-path">${endpoint.path}</div>
                    <div class="endpoint-summary">${endpoint.summary}</div>
                    ${endpoint.description ? `<div class="endpoint-description">${endpoint.description}</div>` : ''}
                </div>
                <div class="endpoint-details">
                    <button class="collapsible-toggle" onclick="explorer.toggleEndpointDetails(${index})">
                        Show Parameters & Execute
                    </button>
                    <div id="details-${index}" class="collapsible-content">
                        ${this.generateParametersForm(endpoint, index)}
                        <div class="execute-section">
                            <button class="execute-btn" onclick="explorer.executeEndpoint(${index})" 
                                    ${!this.personalAccessToken ? 'disabled' : ''} id="execute-btn-${index}">
                                ${this.personalAccessToken ? 'Execute API Call' : 'Enter PAT to Execute'}
                            </button>
                            <button class="add-to-sequence-btn" onclick="explorer.addToSequence(${index})">
                                + Add to Sequence
                            </button>
                        </div>
                        <div id="response-${index}" class="response-section"></div>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `<div class="endpoints-grid">${endpointsHTML}</div>`;
    }

    toggleEndpointDetails(index) {
        const detailsElement = document.getElementById(`details-${index}`);
        const toggleButton = detailsElement.previousElementSibling;
        
        if (detailsElement.classList.contains('show')) {
            detailsElement.classList.remove('show');
            toggleButton.textContent = 'Show Parameters & Execute';
        } else {
            detailsElement.classList.add('show');
            toggleButton.textContent = 'Hide Parameters & Execute';
        }
    }

    generateParametersForm(endpoint, index) {
        const pathParams = this.extractPathParameters(endpoint.path);
        const queryParams = this.getCommonQueryParameters(endpoint);
        const bodyParams = this.getBodyParameters(endpoint);

        let html = '';

        // Path parameters
        if (pathParams.length > 0) {
            html += `
                <div class="parameters-section">
                    <div class="parameters-title">Path Parameters</div>
                    ${pathParams.map(param => `
                        <div class="parameter-group">
                            <label>
                                ${param} <span class="parameter-required">*</span>
                            </label>
                            <input type="text" 
                                   id="path-${param}-${index}" 
                                   placeholder="Enter ${param}"
                                   required>
                            <div class="parameter-description">Required path parameter</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Query parameters
        if (queryParams.length > 0) {
            html += `
                <div class="parameters-section">
                    <div class="parameters-title">Query Parameters</div>
                    ${queryParams.map(param => `
                        <div class="parameter-group">
                            <label>${param.name}</label>
                            <input type="${param.type}" 
                                   id="query-${param.name}-${index}" 
                                   placeholder="${param.description}">
                            <div class="parameter-description">${param.description}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Request body for POST/PUT/PATCH methods
        if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
            html += `
                <div class="parameters-section">
                    <div class="parameters-title">Request Body (JSON)</div>
                    <div class="parameter-group">
                        <label>Body</label>
                        <textarea id="body-${index}" 
                                  placeholder="Enter JSON request body">${bodyParams}</textarea>
                        <div class="parameter-description">JSON request body</div>
                    </div>
                </div>
            `;
        }

        return html;
    }

    extractPathParameters(path) {
        const matches = path.match(/{([^}]+)}/g);
        return matches ? matches.map(match => match.slice(1, -1)) : [];
    }

    getCommonQueryParameters(endpoint) {
        const commonParams = [
            { name: 'limit', type: 'number', description: 'Results per page (1-100)' },
            { name: 'offset', type: 'text', description: 'Pagination offset' },
            { name: 'opt_fields', type: 'text', description: 'Comma-separated list of fields to return' },
            { name: 'opt_expand', type: 'text', description: 'Comma-separated list of fields to expand' }
        ];

        // Add endpoint-specific parameters based on path
        if (endpoint.path.includes('/projects')) {
            commonParams.push(
                { name: 'archived', type: 'checkbox', description: 'Include archived projects' },
                { name: 'team', type: 'text', description: 'Filter by team GID' }
            );
        }

        if (endpoint.path.includes('/tasks')) {
            commonParams.push(
                { name: 'assignee', type: 'text', description: 'Filter by assignee GID' },
                { name: 'project', type: 'text', description: 'Filter by project GID' },
                { name: 'completed_since', type: 'date', description: 'Filter tasks completed after this date' }
            );
        }

        return commonParams.slice(0, 4); // Limit to first 4 for UI simplicity
    }

    getBodyParameters(endpoint) {
        // Return sample JSON for different endpoint types
        const path = endpoint.path.toLowerCase();
        
        if (path.includes('/task') && endpoint.method === 'POST') {
            return JSON.stringify({
                "data": {
                    "name": "New task name",
                    "notes": "Task description",
                    "projects": ["project_gid_here"]
                }
            }, null, 2);
        }
        
        if (path.includes('/project') && endpoint.method === 'POST') {
            return JSON.stringify({
                "data": {
                    "name": "New project name",
                    "notes": "Project description",
                    "team": "team_gid_here"
                }
            }, null, 2);
        }

        return JSON.stringify({
            "data": {
                "name": "Example name",
                "notes": "Example description"
            }
        }, null, 2);
    }

    updateStats() {
        const statsContainer = document.getElementById('stats');
        const totalEndpoints = this.endpoints.length;
        const filteredCount = this.filteredEndpoints.length;
        
        // Count by method
        const methodCounts = {};
        this.filteredEndpoints.forEach(endpoint => {
            methodCounts[endpoint.method] = (methodCounts[endpoint.method] || 0) + 1;
        });

        const methodStats = Object.entries(methodCounts)
            .map(([method, count]) => `${method}: ${count}`)
            .join(' | ');

        statsContainer.innerHTML = `
            <div>
                <strong>Showing ${filteredCount} of ${totalEndpoints} endpoints</strong>
                ${methodStats ? `<br><small>${methodStats}</small>` : ''}
            </div>
        `;
    }

    loadPATFromStorage() {
        try {
            const savedPAT = localStorage.getItem(this.storageKey);
            if (savedPAT) {
                this.personalAccessToken = savedPAT;
            }
        } catch (error) {
            console.warn('Failed to load PAT from localStorage:', error);
        }
    }

    savePATToStorage() {
        try {
            if (this.personalAccessToken) {
                localStorage.setItem(this.storageKey, this.personalAccessToken);
            } else {
                localStorage.removeItem(this.storageKey);
            }
        } catch (error) {
            console.warn('Failed to save PAT to localStorage:', error);
        }
    }

    restorePATToInput() {
        const patInput = document.getElementById('patInput');
        if (patInput && this.personalAccessToken) {
            patInput.value = this.personalAccessToken;
            // Show a message that the PAT was restored
            if (this.personalAccessToken) {
                this.updatePatStatus('📁 PAT loaded from storage - click "Test Connection" to verify', 'info');
            }
        }
    }

    clearStoredPAT() {
        try {
            localStorage.removeItem(this.storageKey);
            this.personalAccessToken = '';
            this.isTokenValid = false;
            const patInput = document.getElementById('patInput');
            if (patInput) {
                patInput.value = '';
            }
            this.updatePatStatus('PAT cleared from storage', 'info');
            this.renderEndpoints();
            this.updateExecuteButtonStatus(); // Update sequence execute button
        } catch (error) {
            console.warn('Failed to clear PAT from localStorage:', error);
        }
    }

    showError(message) {
        const container = document.getElementById('endpointsContainer');
        container.innerHTML = `<div class="error">${message}</div>`;
        
        const statsContainer = document.getElementById('stats');
        statsContainer.innerHTML = '<div class="error">Failed to load API data</div>';
    }

    updatePatStatus(message, type) {
        const statusElement = document.getElementById('patStatus');
        statusElement.textContent = message;
        statusElement.className = `pat-status ${type}`;
    }

    async testConnection() {
        if (!this.personalAccessToken) {
            this.updatePatStatus('Please enter your Personal Access Token', 'error');
            return;
        }

        const testButton = document.getElementById('testConnection');
        testButton.disabled = true;
        testButton.textContent = 'Testing...';
        
        this.updatePatStatus('Testing connection...', 'info');

        try {
            const response = await fetch(`${this.baseUrl}/users/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.personalAccessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.isTokenValid = true;
                this.updatePatStatus(`✅ Connected successfully as ${userData.data.name}`, 'success');
            } else {
                this.isTokenValid = false;
                const errorData = await response.json();
                this.updatePatStatus(`❌ Connection failed: ${errorData.errors?.[0]?.message || 'Invalid token'}`, 'error');
            }
        } catch (error) {
            this.isTokenValid = false;
            this.updatePatStatus(`❌ Connection failed: ${error.message}`, 'error');
        } finally {
            testButton.disabled = false;
            testButton.textContent = 'Test Connection';
            this.renderEndpoints(); // Re-render to update execute buttons
        }
    }

    canExecuteEndpoint(endpoint) {
        // Only allow execution for safe GET endpoints that don't require parameters
        const safeEndpoints = [
            '/users/me',
            '/workspaces',
            '/users',
            '/teams',
            '/tags',
            '/custom_fields',
            '/projects',
            '/portfolios',
            '/goals'
        ];
        
        // Safe patterns that don't require path parameters
        const safePatterns = [
            /^\/users$/,
            /^\/workspaces$/,
            /^\/teams$/,
            /^\/tags$/,
            /^\/custom_fields$/,
            /^\/projects$/,
            /^\/portfolios$/,
            /^\/goals$/,
            /^\/users\/me$/
        ];
        
        return endpoint.method === 'GET' && 
               (safeEndpoints.includes(endpoint.path) || 
                safePatterns.some(pattern => pattern.test(endpoint.path)));
    }

    async executeEndpoint(endpointIndex) {
        const endpoint = this.filteredEndpoints[endpointIndex];
        const responseContainer = document.getElementById(`response-${endpointIndex}`);
        const executeButton = document.getElementById(`execute-btn-${endpointIndex}`);
        
        if (!this.personalAccessToken) {
            this.showApiResponse(responseContainer, 'Please enter and test your PAT first', 'error');
            return;
        }

        // Show loading state
        executeButton.innerHTML = '<span class="loading"></span> Executing...';
        executeButton.disabled = true;
        responseContainer.style.display = 'block';
        this.showApiResponse(responseContainer, 'Executing API call...', 'loading');

        try {
            // Build URL with path parameters
            let apiUrl = this.buildUrlWithParameters(endpoint, endpointIndex);
            
            // Build query parameters
            const queryParams = this.buildQueryParameters(endpointIndex);
            if (queryParams.size > 0) {
                apiUrl += `?${queryParams.toString()}`;
            }

            // Build request body for POST/PUT/PATCH
            let requestBody = null;
            if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
                requestBody = this.buildRequestBody(endpointIndex);
            }

            const fetchOptions = {
                method: endpoint.method,
                headers: {
                    'Authorization': `Bearer ${this.personalAccessToken}`,
                    'Accept': 'application/json'
                }
            };

            if (requestBody) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = requestBody;
            }

            const response = await fetch(apiUrl, fetchOptions);
            const responseData = await response.json();
            
            // Display response
            const responseHeaders = Array.from(response.headers.entries())
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n');

            const responseContent = `
                <div class="response-headers">Status: ${response.status} ${response.statusText}
URL: ${apiUrl}
${responseHeaders}</div>
                <div class="response-body">${JSON.stringify(responseData, null, 2)}</div>
            `;
            
            if (response.ok) {
                this.showApiResponse(responseContainer, responseContent, 'success');
            } else {
                this.showApiResponse(responseContainer, responseContent, 'error');
            }
        } catch (error) {
            this.showApiResponse(responseContainer, 
                `Network Error: ${error.message}`, 'error');
        } finally {
            // Reset button state
            executeButton.innerHTML = 'Execute API Call';
            executeButton.disabled = false;
        }
    }

    buildUrlWithParameters(endpoint, index) {
        let url = `${this.baseUrl}${endpoint.path}`;
        
        // Replace path parameters
        const pathParams = this.extractPathParameters(endpoint.path);
        pathParams.forEach(param => {
            const input = document.getElementById(`path-${param}-${index}`);
            if (input && input.value.trim()) {
                url = url.replace(`{${param}}`, encodeURIComponent(input.value.trim()));
            }
        });
        
        return url;
    }

    buildQueryParameters(endpointIndex) {
        const params = new URLSearchParams();
        
        // For sequence execution, get parameters from sequence item
        const sequenceItem = this.currentSequenceItem;
        
        if (sequenceItem) {
            // Use parameters from sequence item with variable substitution
            Object.entries(sequenceItem.parameters.query).forEach(([key, value]) => {
                if (value && value !== '') {
                    // Check if value contains variable placeholder
                    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
                        const resolvedValue = this.resolveVariablePlaceholder(value);
                        if (resolvedValue !== null) {
                            params.append(key, resolvedValue);
                        }
                    } else {
                        params.append(key, value);
                    }
                }
            });
        } else {
            // Normal endpoint execution - use form inputs
            const limitInput = document.getElementById(`query-limit-${endpointIndex}`);
            if (limitInput && limitInput.value) {
                params.append('limit', limitInput.value);
            } else {
                params.append('limit', '10'); // Default limit
            }

            const offsetInput = document.getElementById(`query-offset-${endpointIndex}`);
            if (offsetInput && offsetInput.value) {
                params.append('offset', offsetInput.value);
            }

            const fieldsInput = document.getElementById(`query-opt_fields-${endpointIndex}`);
            if (fieldsInput && fieldsInput.value) {
                params.append('opt_fields', fieldsInput.value);
            }

            const expandInput = document.getElementById(`query-opt_expand-${endpointIndex}`);
            if (expandInput && expandInput.value) {
                params.append('opt_expand', expandInput.value);
            }

            // Additional endpoint-specific parameters
            ['archived', 'team', 'assignee', 'project', 'workspace', 'completed_since'].forEach(paramName => {
                const input = document.getElementById(`query-${paramName}-${endpointIndex}`);
                if (input && input.value) {
                    if (input.type === 'checkbox') {
                        if (input.checked) {
                            params.append(paramName, 'true');
                        }
                    } else {
                        params.append(paramName, input.value);
                    }
                }
            });
        }

        params.append('opt_pretty', 'true');
        return params;
    }

    resolveVariablePlaceholder(value) {
        // Extract variable path from {{variable.path}} format
        const match = value.match(/\{\{([^}]+)\}\}/);
        if (match) {
            const variablePath = match[1];
            const resolvedValue = this.resolveVariable(variablePath);
            console.log(`Resolving variable: ${value} → ${resolvedValue}`);
            return resolvedValue;
        }
        return value;
    }

    buildRequestBody(index) {
        const bodyTextarea = document.getElementById(`body-${index}`);
        if (bodyTextarea && bodyTextarea.value.trim()) {
            try {
                // Validate JSON
                JSON.parse(bodyTextarea.value.trim());
                return bodyTextarea.value.trim();
            } catch (error) {
                throw new Error(`Invalid JSON in request body: ${error.message}`);
            }
        }
        return null;
    }

    showApiResponse(container, content, type) {
        const icon = type === 'loading' ? '⏳' : type === 'success' ? '✅' : '❌';
        const title = type === 'loading' ? 'Loading...' : type === 'success' ? 'Success' : 'Error';
        
        container.innerHTML = `
            <div class="response-content">
                <div style="font-weight: bold; margin-bottom: 10px; color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#6c757d'}">
                    ${icon} ${title}
                </div>
                ${content}
            </div>
        `;
    }

    // Sequence Management Methods
    toggleSequencePanel() {
        console.log('Toggling sequence panel, current state:', this.sequencePanelOpen);
        const panel = document.getElementById('sequencePanel');
        
        if (!panel) {
            console.error('Sequence panel element not found');
            return;
        }
        
        console.log('Current panel width:', this.currentPanelWidth);
        console.log('Panel current style:', {
            width: panel.style.width,
            right: panel.style.right
        });
        
        this.sequencePanelOpen = !this.sequencePanelOpen;
        
        if (this.sequencePanelOpen) {
            // Ensure panel dimensions are set
            if (!this.currentPanelWidth) {
                this.currentPanelWidth = this.defaultPanelWidth;
                console.warn('Panel width not set, using default:', this.defaultPanelWidth);
            }
            
            // Apply width and positioning
            panel.style.width = this.currentPanelWidth + 'px';
            panel.style.right = `-${this.currentPanelWidth}px`;
            
            // Force a reflow to ensure styles are applied
            panel.offsetHeight;
            
            // Then open the panel
            panel.classList.add('open');
            document.body.style.marginRight = this.currentPanelWidth + 'px';
            console.log('Panel opened with width:', this.currentPanelWidth);
        } else {
            panel.classList.remove('open');
            document.body.style.marginRight = '0';
            console.log('Panel closed');
        }
    }

    loadPanelWidth() {
        try {
            const savedWidth = localStorage.getItem(this.panelWidthStorageKey);
            this.currentPanelWidth = savedWidth ? parseInt(savedWidth) : this.defaultPanelWidth;
            
            // Ensure width is within bounds
            this.currentPanelWidth = Math.max(this.minPanelWidth, 
                Math.min(this.currentPanelWidth, this.maxPanelWidth));
            
            console.log('Loaded panel width:', this.currentPanelWidth);
            
            // Apply the width to the panel if it exists
            this.applyPanelWidth();
        } catch (error) {
            console.warn('Failed to load panel width from storage:', error);
            this.currentPanelWidth = this.defaultPanelWidth;
        }
    }

    applyPanelWidth() {
        const panel = document.getElementById('sequencePanel');
        if (panel && this.currentPanelWidth) {
            panel.style.width = this.currentPanelWidth + 'px';
            panel.style.right = `-${this.currentPanelWidth}px`;
            console.log('Applied panel width:', this.currentPanelWidth);
        } else {
            console.warn('Cannot apply panel width - panel element not found or width not set');
        }
    }

    savePanelWidth() {
        try {
            localStorage.setItem(this.panelWidthStorageKey, this.currentPanelWidth.toString());
        } catch (error) {
            console.warn('Failed to save panel width to storage:', error);
        }
    }

    setupPanelResize() {
        const panel = document.getElementById('sequencePanel');
        if (!panel) {
            console.error('Cannot setup panel resize - panel element not found');
            return;
        }
        
        const resizeHandle = panel.querySelector('.resize-handle');
        if (!resizeHandle) {
            console.error('Cannot setup panel resize - resize handle not found');
            return;
        }
        
        // Ensure panel width is applied
        this.applyPanelWidth();
        
        let startX, startWidth;

        const startResize = (e) => {
            this.isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(panel).width, 10);
            
            panel.classList.add('resizing');
            resizeHandle.classList.add('active');
            document.body.classList.add('resizing');
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        };

        const doResize = (e) => {
            if (!this.isResizing) return;
            
            // Calculate new width (resize from left edge, so subtract the difference)
            const newWidth = startWidth - (e.clientX - startX);
            
            // Enforce min/max constraints
            const constrainedWidth = Math.max(this.minPanelWidth, 
                Math.min(newWidth, this.maxPanelWidth));
            
            // Apply the new width
            panel.style.width = constrainedWidth + 'px';
            panel.style.right = this.sequencePanelOpen ? '0' : `-${constrainedWidth}px`;
            
            // Update body margin if panel is open
            if (this.sequencePanelOpen) {
                document.body.style.marginRight = constrainedWidth + 'px';
            }
            
            this.currentPanelWidth = constrainedWidth;
        };

        const stopResize = () => {
            this.isResizing = false;
            panel.classList.remove('resizing');
            resizeHandle.classList.remove('active');
            document.body.classList.remove('resizing');
            
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Save the new width to localStorage
            this.savePanelWidth();
        };

        resizeHandle.addEventListener('mousedown', startResize);
        
        // Update max width on window resize
        window.addEventListener('resize', () => {
            this.maxPanelWidth = window.innerWidth * 0.8;
            if (this.currentPanelWidth > this.maxPanelWidth) {
                this.currentPanelWidth = this.maxPanelWidth;
                panel.style.width = this.currentPanelWidth + 'px';
                if (this.sequencePanelOpen) {
                    document.body.style.marginRight = this.currentPanelWidth + 'px';
                }
                this.savePanelWidth();
            }
        });
    }

    addToSequence(endpointIndex) {
        const endpoint = this.filteredEndpoints[endpointIndex];
        const sequenceItem = {
            id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            endpoint: endpoint,
            endpointIndex: endpointIndex,
            parameters: this.captureCurrentParameters(endpointIndex),
            variableMappings: {},
            executed: false,
            result: null,
            error: null
        };

        this.apiSequence.push(sequenceItem);
        this.renderSequence();
        
        // Open sequence panel if not already open
        if (!this.sequencePanelOpen) {
            this.toggleSequencePanel();
        }
    }

    captureCurrentParameters(endpointIndex) {
        const endpoint = this.filteredEndpoints[endpointIndex];
        const parameters = {
            path: {},
            query: {},
            body: null
        };

        // Capture path parameters
        const pathParams = this.extractPathParameters(endpoint.path);
        pathParams.forEach(param => {
            const input = document.getElementById(`path-${param}-${endpointIndex}`);
            if (input) {
                parameters.path[param] = input.value;
            }
        });

        // Capture query parameters
        const queryParams = ['limit', 'offset', 'opt_fields', 'opt_expand', 'archived', 'team', 'assignee', 'project', 'completed_since'];
        queryParams.forEach(param => {
            const input = document.getElementById(`query-${param}-${endpointIndex}`);
            if (input) {
                if (input.type === 'checkbox') {
                    parameters.query[param] = input.checked;
                } else {
                    parameters.query[param] = input.value;
                }
            }
        });

        // Capture body
        if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
            const bodyInput = document.getElementById(`body-${endpointIndex}`);
            if (bodyInput) {
                parameters.body = bodyInput.value;
            }
        }

        return parameters;
    }

    renderSequence() {
        const container = document.getElementById('sequenceItems');
        
        if (this.apiSequence.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #6c757d; padding: 2rem;">
                    <p>No endpoints in sequence yet.</p>
                    <p><small>Click the "Add to Sequence" button on any endpoint to start building your API call chain.</small></p>
                </div>
            `;
            return;
        }

        const sequenceHTML = this.apiSequence.map((item, index) => {
            const availableVariables = this.getAvailableVariables(index);
            
            return `
                <div class="sequence-item ${item.executed ? (item.error ? 'error' : 'executed') : ''} ${item.isImported ? 'imported' : ''}" id="seq-item-${item.id}">
                    <div class="sequence-item-header">
                        <span>${index + 1}. ${item.endpoint.method} ${item.endpoint.path}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${item.isImported ? '<span style="background: #17a2b8; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px;">IMPORTED</span>' : ''}
                            <button onclick="explorer.removeFromSequence('${item.id}')" style="background: none; border: none; color: #dc3545; cursor: pointer;">×</button>
                        </div>
                    </div>
                    <div class="sequence-item-content">
                        <div style="font-size: 12px; color: #6c757d; margin-bottom: 10px;">
                            ${item.endpoint.summary}
                            ${item.isImported ? '<br><em>⚠️ This endpoint was imported and may not match current API spec</em>' : ''}
                        </div>
                        
                        ${this.renderParameterSummary(item)}
                        
                        ${this.renderVariableMappings(item, index, availableVariables)}
                        
                        ${this.renderSequenceParameterEditor(item, index)}
                        
                        <div style="margin-top: 10px;">
                            <button class="sequence-btn sequence-btn-primary" onclick="explorer.executeSequenceItem('${item.id}')" style="font-size: 12px;" ${!this.personalAccessToken ? 'disabled' : ''}>
                                ${this.personalAccessToken ? 'Execute This Step' : 'Enter PAT to Execute'}
                            </button>
                            <button class="sequence-btn sequence-btn-secondary" onclick="explorer.toggleParameterEditor('${item.id}')" style="font-size: 12px; margin-left: 8px;">
                                ⚙️ Edit Parameters
                            </button>
                        </div>
                        
                        ${item.executed ? `
                            <div class="sequence-results">
                                ${item.error ? 
                                    `<div class="results-header">
                                        <span style="color: #dc3545;">❌ Error: ${item.error}</span>
                                        <div class="results-actions">
                                            <button class="copy-btn" onclick="explorer.copySequenceResult('${item.id}', 'error')">
                                                📋 Copy Error
                                            </button>
                                        </div>
                                    </div>` :
                                    `<div class="results-header">
                                        <span style="color: #28a745;">✅ Success (${item.result?.data ? Array.isArray(item.result.data) ? item.result.data.length + ' items' : '1 item' : 'No data'})</span>
                                        <div class="results-actions">
                                            <button class="copy-btn" onclick="explorer.copySequenceResult('${item.id}', 'json')">
                                                📋 Copy JSON
                                            </button>
                                            <button class="copy-btn" onclick="explorer.copySequenceResult('${item.id}', 'formatted')">
                                                📄 Copy Formatted
                                            </button>
                                            ${item.result?.data && Array.isArray(item.result.data) ? `
                                                <button class="copy-btn" onclick="explorer.copySequenceResult('${item.id}', 'csv')">
                                                    📊 Copy CSV
                                                </button>
                                            ` : ''}
                                            <button class="copy-btn" onclick="explorer.showItemInGrid('${item.id}')" style="background: #17a2b8;">
                                                🏗️ Show in Grid
                                            </button>
                                        </div>
                                    </div>
                                     <div style="font-family: 'Courier New', monospace; font-size: 11px; margin-top: 5px; background: #f8f9fa; padding: 8px; border-radius: 4px; max-height: 200px; overflow-y: auto;">
                                         ${JSON.stringify(item.result, null, 2).substring(0, 500)}${JSON.stringify(item.result).length > 500 ? '...\n\n[Truncated - use Copy buttons for full content]' : ''}
                                     </div>`
                                }
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = sequenceHTML;

        // Add transform section after sequence items if there's a final result
        this.renderTransformSection();

        // Update execute button status
        this.updateExecuteButtonStatus();

        // Restore parameter values to form fields after rendering
        setTimeout(() => {
            this.restoreParametersToForms();
        }, 50);
    }

    renderTransformSection() {
        // Check if we have a final result that can be transformed
        const lastExecutedItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );

        const container = document.getElementById('sequenceItems');
        
        if (lastExecutedItem) {
            const stepIndex = this.apiSequence.indexOf(lastExecutedItem);
            const recordCount = Array.isArray(lastExecutedItem.result.data) 
                ? lastExecutedItem.result.data.length 
                : 1;

            // Add transform section HTML
            const transformSectionHTML = `
                <div id="transformTrigger" style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h4 style="margin: 0; color: #333; font-size: 14px;">
                                🔄 Transform Final Result
                            </h4>
                            <p style="margin: 0.25rem 0 0 0; font-size: 12px; color: #666;">
                                Step ${stepIndex + 1}: ${lastExecutedItem.endpoint.method} ${lastExecutedItem.endpoint.path} 
                                (${recordCount} record${recordCount !== 1 ? 's' : ''})
                            </p>
                        </div>
                        <button class="sequence-btn sequence-btn-info" onclick="explorer.showTransformation()" style="font-size: 12px; background: #17a2b8;">
                            🔄 Transform Data
                        </button>
                    </div>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', transformSectionHTML);
        } else {
            // Remove transform section if no final result
            const existingSection = document.getElementById('transformTrigger');
            if (existingSection) {
                existingSection.remove();
            }
        }
    }

    updateExecuteButtonStatus() {
        const executeBtn = document.querySelector('button[onclick="explorer.executeSequence()"]');
        if (!executeBtn) return;

        const hasVariableMappings = this.apiSequence.some(item => 
            item.variableMappings && Object.keys(item.variableMappings).length > 0
        );

        const hasToken = !!this.personalAccessToken;
        const hasSequence = this.apiSequence.length > 0;

        if (hasSequence && hasToken) {
            executeBtn.disabled = false;
            if (hasVariableMappings) {
                executeBtn.innerHTML = '🚀 Execute All (Ready)';
                executeBtn.className = 'sequence-btn sequence-btn-success';
                executeBtn.style.background = '#28a745';
                executeBtn.style.borderColor = '#28a745';
            } else {
                executeBtn.innerHTML = '▶ Execute All';
                executeBtn.className = 'sequence-btn sequence-btn-success';
                executeBtn.style.background = '';
                executeBtn.style.borderColor = '';
            }
        } else {
            executeBtn.disabled = true;
            if (!hasToken) {
                executeBtn.innerHTML = '🔑 Set PAT to Execute';
                executeBtn.className = 'sequence-btn sequence-btn-warning';
            } else {
                executeBtn.innerHTML = '▶ Execute All';
                executeBtn.className = 'sequence-btn sequence-btn-success';
            }
        }
    }

    getAvailableVariables(currentIndex) {
        const variables = [];
        
        for (let i = 0; i < currentIndex; i++) {
            const prevItem = this.apiSequence[i];
            if (prevItem.executed && prevItem.result) {
                // Extract common variable paths from the result
                const result = prevItem.result;
                
                if (result.data) {
                    if (Array.isArray(result.data)) {
                        variables.push({
                            path: `${prevItem.id}.data[0].gid`,
                            description: `First item GID from step ${i + 1}`,
                            example: result.data[0]?.gid
                        });
                        variables.push({
                            path: `${prevItem.id}.data[0].name`,
                            description: `First item name from step ${i + 1}`,
                            example: result.data[0]?.name
                        });
                    } else {
                        variables.push({
                            path: `${prevItem.id}.data.gid`,
                            description: `GID from step ${i + 1}`,
                            example: result.data.gid
                        });
                        variables.push({
                            path: `${prevItem.id}.data.name`,
                            description: `Name from step ${i + 1}`,
                            example: result.data.name
                        });
                    }
                }
            }
        }
        
        return variables;
    }

    renderParameterSummary(item) {
        const pathParams = Object.entries(item.parameters.path).filter(([key, value]) => value);
        const queryParams = Object.entries(item.parameters.query).filter(([key, value]) => value && value !== '');
        const hasBody = item.parameters.body;

        if (pathParams.length === 0 && queryParams.length === 0 && !hasBody) {
            return '';
        }

        let html = '<div class="parameter-summary">';
        
        if (pathParams.length > 0) {
            html += '<div class="param-group"><span class="param-label">Path:</span> ';
            html += pathParams.map(([key, value]) => {
                const displayValue = this.formatParameterValue(value);
                return `{${key}}: <span class="param-value">${displayValue}</span>`;
            }).join(', ');
            html += '</div>';
        }

        if (queryParams.length > 0) {
            html += '<div class="param-group"><span class="param-label">Query:</span> ';
            html += queryParams.map(([key, value]) => {
                const displayValue = this.formatParameterValue(value);
                return `${key}: <span class="param-value">${displayValue}</span>`;
            }).join(', ');
            html += '</div>';
        }

        if (hasBody) {
            const bodyPreview = item.parameters.body.length > 50 
                ? item.parameters.body.substring(0, 50) + '...' 
                : item.parameters.body;
            html += `<div class="param-group"><span class="param-label">Body:</span> <span class="param-value">${bodyPreview}</span></div>`;
        }

        html += '</div>';
        return html;
    }

    formatParameterValue(value) {
        if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
            return `<em style="color: #007bff;">${value}</em> (variable)`;
        }
        return value;
    }

    renderSequenceParameterEditor(item, index) {
        const pathParams = this.extractPathParameters(item.endpoint.path);
        
        return `
            <div id="param-editor-${item.id}" class="sequence-parameter-editor">
                <div class="param-editor-title">Configure Parameters</div>
                
                ${pathParams.length > 0 ? `
                    <div class="param-editor-section">
                        <div class="param-editor-title">Path Parameters</div>
                        ${pathParams.map(param => `
                            <div style="margin-bottom: 8px;">
                                <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 4px;">
                                    {${param}} <span style="color: #dc3545;">*</span>
                                </label>
                                <div style="display: flex; gap: 5px;">
                                    <input type="text" 
                                           class="param-editor-input" 
                                           id="seq-path-${param}-${item.id}"
                                           value="${item.parameters.path[param] || ''}"
                                           placeholder="Enter ${param} or use {{variable}}"
                                           style="flex: 1;"
                                           onchange="explorer.updateSequenceParameter('${item.id}', 'path', '${param}', this.value)">
                                    <button onclick="explorer.showVariableHelper('seq-path-${param}-${item.id}', ${index})"
                                            style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px;">
                                        📋 Vars
                                    </button>
                                </div>
                                <div class="param-hint">Use {{stepId.data[0].gid}} for variables</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="param-editor-section">
                    <div class="param-editor-title">Query Parameters</div>
                    <div style="margin-bottom: 10px;">
                        <button onclick="explorer.applyParameterPreset('${item.id}', 'minimal')" 
                                style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px; margin-right: 5px;">
                            Minimal
                        </button>
                        <button onclick="explorer.applyParameterPreset('${item.id}', 'detailed')" 
                                style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px; margin-right: 5px;">
                            Detailed
                        </button>
                        <button onclick="explorer.applyParameterPreset('${item.id}', 'full')" 
                                style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 11px;">
                            Full Fields
                        </button>
                    </div>
                    <div class="param-editor-grid">
                        <input type="text" 
                               class="param-editor-input" 
                               id="seq-query-limit-${item.id}"
                               value="${item.parameters.query.limit || ''}"
                               placeholder="limit (e.g., 10)"
                               onchange="explorer.updateSequenceParameter('${item.id}', 'query', 'limit', this.value)">
                        <input type="text" 
                               class="param-editor-input" 
                               id="seq-query-offset-${item.id}"
                               value="${item.parameters.query.offset || ''}"
                               placeholder="offset"
                               onchange="explorer.updateSequenceParameter('${item.id}', 'query', 'offset', this.value)">
                        <input type="text" 
                               class="param-editor-input" 
                               id="seq-query-opt_fields-${item.id}"
                               value="${item.parameters.query.opt_fields || ''}"
                               placeholder="opt_fields (e.g., name,gid)"
                               onchange="explorer.updateSequenceParameter('${item.id}', 'query', 'opt_fields', this.value)">
                        <input type="text" 
                               class="param-editor-input" 
                               id="seq-query-opt_expand-${item.id}"
                               value="${item.parameters.query.opt_expand || ''}"
                               placeholder="opt_expand"
                               onchange="explorer.updateSequenceParameter('${item.id}', 'query', 'opt_expand', this.value)">
                    </div>
                    
                        ${this.renderEndpointSpecificQueryParams(item)}
                        
                        ${this.renderQueryParameterVariableMappings(item, index)}
                </div>                ${['POST', 'PUT', 'PATCH'].includes(item.endpoint.method) ? `
                    <div class="param-editor-section">
                        <div class="param-editor-title">Request Body (JSON)</div>
                        <textarea class="param-editor-textarea"
                                  id="seq-body-${item.id}"
                                  placeholder="Enter JSON request body"
                                  onchange="explorer.updateSequenceParameter('${item.id}', 'body', null, this.value)">${item.parameters.body || ''}</textarea>
                        <div class="param-hint">Use {{variable}} placeholders for dynamic values</div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderEndpointSpecificQueryParams(item) {
        const path = item.endpoint.path.toLowerCase();
        let specificParams = [];

        if (path.includes('/projects')) {
            specificParams = [
                { name: 'workspace', placeholder: 'workspace GID or {{variable}}' },
                { name: 'team', placeholder: 'team GID' },
                { name: 'archived', placeholder: 'true/false' }
            ];
        } else if (path.includes('/tasks')) {
            specificParams = [
                { name: 'project', placeholder: 'project GID or {{variable}}' },
                { name: 'assignee', placeholder: 'assignee GID' },
                { name: 'workspace', placeholder: 'workspace GID or {{variable}}' },
                { name: 'completed_since', placeholder: 'YYYY-MM-DD' }
            ];
        } else if (path.includes('/users')) {
            specificParams = [
                { name: 'workspace', placeholder: 'workspace GID or {{variable}}' },
                { name: 'team', placeholder: 'team GID' }
            ];
        }

        if (specificParams.length === 0) {
            return '';
        }

        return `
            <div style="margin-top: 12px;">
                <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #6c757d;">
                    Endpoint-Specific Parameters
                </div>
                <div class="param-editor-grid">
                    ${specificParams.map(param => `
                        <input type="text" 
                               class="param-editor-input" 
                               id="seq-query-${param.name}-${item.id}"
                               value="${item.parameters.query[param.name] || ''}"
                               placeholder="${param.placeholder}"
                               onchange="explorer.updateSequenceParameter('${item.id}', 'query', '${param.name}', this.value)">
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderQueryParameterVariableMappings(item, itemIndex) {
        const availableVariables = this.getAvailableVariables(itemIndex);
        
        // Find query parameters that could use variable mapping
        const path = item.endpoint.path.toLowerCase();
        let mappableParams = [];

        if (path.includes('/projects')) {
            mappableParams = ['workspace', 'team'];
        } else if (path.includes('/tasks')) {
            mappableParams = ['project', 'assignee', 'workspace'];
        } else if (path.includes('/users')) {
            mappableParams = ['workspace', 'team'];
        }

        if (mappableParams.length === 0 && availableVariables.length === 0) {
            return '';
        }

        // Include any existing query parameter variable mappings from imported sequences
        const allVariableOptions = [...availableVariables];
        
        mappableParams.forEach(param => {
            const currentValue = item.parameters.query[param];
            if (currentValue && currentValue.includes('{{') && currentValue.includes('}}')) {
                const match = currentValue.match(/\{\{([^}]+)\}\}/);
                if (match && !allVariableOptions.find(v => v.path === match[1])) {
                    allVariableOptions.push({
                        path: match[1],
                        description: `Imported mapping for ${param}`,
                        example: 'Not executed yet'
                    });
                }
            }
        });

        if (allVariableOptions.length === 0) {
            return '';
        }

        return `
            <div style="margin-top: 12px;">
                <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #6c757d;">
                    Query Parameter Variable Mappings
                </div>
                ${mappableParams.map(param => `
                    <div style="margin-bottom: 8px;">
                        <label style="display: block; font-weight: 600; font-size: 11px; margin-bottom: 4px;">
                            ${param} variable source:
                        </label>
                        <select id="query-mapping-${item.id}-${param}" 
                                onchange="explorer.updateQueryVariableMapping('${item.id}', '${param}', this.value)"
                                style="width: 100%; padding: 4px; font-size: 11px;">
                            <option value="">Manual input (use text field above)</option>
                            ${allVariableOptions.map(variable => {
                                const currentValue = item.parameters.query[param];
                                const isSelected = currentValue && currentValue === `{{${variable.path}}}`;
                                return `<option value="${variable.path}" ${isSelected ? 'selected' : ''}>
                                    ${variable.description} (${variable.example})
                                </option>`;
                            }).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        `;
    }

    updateQueryVariableMapping(itemId, paramName, variablePath) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item) return;

        if (variablePath) {
            // Set the query parameter to use the variable
            item.parameters.query[paramName] = `{{${variablePath}}}`;
            
            // Update the corresponding text input field
            const input = document.getElementById(`seq-query-${paramName}-${itemId}`);
            if (input) {
                input.value = `{{${variablePath}}}`;
            }
        } else {
            // Clear the variable mapping, keep any manual value
            const currentValue = item.parameters.query[paramName];
            if (currentValue && currentValue.includes('{{') && currentValue.includes('}}')) {
                delete item.parameters.query[paramName];
                
                // Clear the text input field
                const input = document.getElementById(`seq-query-${paramName}-${itemId}`);
                if (input) {
                    input.value = '';
                }
            }
        }

        console.log(`Updated query variable mapping: ${paramName} = ${variablePath || 'manual'}`);
        
        // Update the parameter summary
        this.updateParameterSummaryOnly(item);
    }

    toggleParameterEditor(itemId) {
        const editor = document.getElementById(`param-editor-${itemId}`);
        if (editor) {
            editor.classList.toggle('show');
        }
    }

    updateSequenceParameter(itemId, paramType, paramName, value) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item) return;

        console.log(`Updating parameter: ${itemId}.${paramType}.${paramName} = ${value}`);

        if (paramType === 'path') {
            item.parameters.path[paramName] = value;
        } else if (paramType === 'query') {
            if (value && value.trim()) {
                item.parameters.query[paramName] = value.trim();
            } else {
                delete item.parameters.query[paramName];
            }
        } else if (paramType === 'body') {
            item.parameters.body = value;
        }

        // Don't re-render to avoid losing focus, just update the parameter summary
        this.updateParameterSummaryOnly(item);
    }

    updateParameterSummaryOnly(item) {
        // Find and update just the parameter summary for this item
        const summaryElement = document.querySelector(`#seq-item-${item.id} .parameter-summary`);
        if (summaryElement) {
            summaryElement.innerHTML = this.renderParameterSummary(item).replace('<div class="parameter-summary">', '').replace('</div>', '');
        }
    }

    applyParameterPreset(itemId, presetType) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item) return;

        const path = item.endpoint.path.toLowerCase();
        
        let presets = {
            minimal: {
                limit: '10',
                opt_fields: 'gid,name'
            },
            detailed: {
                limit: '20',
                opt_fields: 'gid,name,created_at,modified_at'
            },
            full: {
                limit: '50',
                opt_fields: this.getFullFieldsForEndpoint(path)
            }
        };

        // Apply endpoint-specific presets
        if (path.includes('/tasks')) {
            presets.minimal.opt_fields = 'gid,name,completed';
            presets.detailed.opt_fields = 'gid,name,completed,assignee.name,due_date,created_at';
            presets.full.opt_fields = 'gid,name,completed,assignee,due_date,notes,created_at,modified_at,projects.name,tags.name';
        } else if (path.includes('/projects')) {
            presets.minimal.opt_fields = 'gid,name,completed';
            presets.detailed.opt_fields = 'gid,name,completed,team.name,created_at,modified_at';
            presets.full.opt_fields = 'gid,name,completed,notes,team,members.name,created_at,modified_at,archived,color';
        } else if (path.includes('/workspaces')) {
            presets.minimal.opt_fields = 'gid,name';
            presets.detailed.opt_fields = 'gid,name,is_organization';
            presets.full.opt_fields = 'gid,name,is_organization,email_domains';
        }

        const preset = presets[presetType];
        if (preset) {
            Object.entries(preset).forEach(([key, value]) => {
                item.parameters.query[key] = value;
                
                // Update the input field immediately
                const input = document.getElementById(`seq-query-${key}-${itemId}`);
                if (input) {
                    input.value = value;
                }
            });

            // Update just the parameter summary instead of full re-render
            this.updateParameterSummaryOnly(item);
            this.showSequenceMessage(`✅ Applied ${presetType} parameter preset`, 'success');
        }
    }

    getFullFieldsForEndpoint(path) {
        if (path.includes('/tasks')) {
            return 'gid,name,completed,assignee,due_date,notes,created_at,modified_at,projects.name,tags.name,subtasks.name';
        } else if (path.includes('/projects')) {
            return 'gid,name,completed,notes,team,members.name,created_at,modified_at,archived,color,due_date';
        } else if (path.includes('/users')) {
            return 'gid,name,email,photo.image_128x128,workspaces.name';
        } else if (path.includes('/workspaces')) {
            return 'gid,name,is_organization,email_domains';
        }
        return 'gid,name,created_at,modified_at';
    }

    showVariableHelper(inputId, currentIndex) {
        const availableVariables = this.getAvailableVariables(currentIndex);
        
        if (availableVariables.length === 0) {
            this.showSequenceMessage('ℹ️ No variables available. Execute previous steps first.', 'info');
            return;
        }

        // Create a simple dropdown/popup with available variables
        const input = document.getElementById(inputId);
        if (!input) return;

        const variableList = availableVariables.map(variable => 
            `<div style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" 
                  onclick="explorer.insertVariable('${inputId}', '{{${variable.path}}}')">
                <strong>${variable.path}</strong><br>
                <small style="color: #6c757d;">${variable.description} → ${variable.example}</small>
            </div>`
        ).join('');

        // Remove existing helper if any
        const existingHelper = document.getElementById('variable-helper');
        if (existingHelper) {
            existingHelper.remove();
        }

        // Create helper popup
        const helper = document.createElement('div');
        helper.id = 'variable-helper';
        helper.innerHTML = `
            <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: white; border: 1px solid #dee2e6; border-radius: 8px; 
                        box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10001; max-width: 400px; max-height: 300px; overflow-y: auto;">
                <div style="padding: 15px; border-bottom: 1px solid #eee; background: #f8f9fa; font-weight: 600;">
                    Available Variables
                    <button onclick="document.getElementById('variable-helper').remove()" 
                            style="float: right; background: none; border: none; font-size: 18px; cursor: pointer;">&times;</button>
                </div>
                <div>
                    ${variableList}
                </div>
            </div>
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000;" 
                 onclick="document.getElementById('variable-helper').remove()"></div>
        `;

        document.body.appendChild(helper);
    }

    insertVariable(inputId, variableText) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = variableText;
            input.dispatchEvent(new Event('change'));
        }

        // Close the helper
        const helper = document.getElementById('variable-helper');
        if (helper) {
            helper.remove();
        }
    }

    async copySequenceResult(itemId, format) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item || !item.executed) {
            this.showSequenceMessage('❌ No result to copy', 'error');
            return;
        }

        let content = '';
        let mimeType = 'text/plain';

        try {
            switch (format) {
                case 'json':
                    content = JSON.stringify(item.result, null, 2);
                    mimeType = 'application/json';
                    break;

                case 'formatted':
                    content = this.formatResultForCopy(item);
                    break;

                case 'csv':
                    if (item.result?.data && Array.isArray(item.result.data)) {
                        content = this.convertToCSV(item.result.data);
                        mimeType = 'text/csv';
                    } else {
                        this.showSequenceMessage('❌ CSV format only available for array data', 'error');
                        return;
                    }
                    break;

                case 'error':
                    content = `API Error Details:
Endpoint: ${item.endpoint.method} ${item.endpoint.path}
Error: ${item.error}
Timestamp: ${new Date().toISOString()}

Full Error Response:
${item.result ? JSON.stringify(item.result, null, 2) : 'No response data'}`;
                    break;

                default:
                    content = JSON.stringify(item.result, null, 2);
            }

            // Use the modern Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(content);
                this.showCopyFeedback(itemId, format);
            } else {
                // Fallback for older browsers
                this.fallbackCopyToClipboard(content);
                this.showCopyFeedback(itemId, format);
            }

        } catch (error) {
            console.error('Copy failed:', error);
            this.showSequenceMessage('❌ Failed to copy to clipboard', 'error');
        }
    }

    formatResultForCopy(item) {
        const timestamp = new Date().toISOString();
        const endpoint = `${item.endpoint.method} ${item.endpoint.path}`;
        
        let formatted = `Asana API Result
Endpoint: ${endpoint}
Summary: ${item.endpoint.summary}
Timestamp: ${timestamp}
Status: ${item.error ? 'Error' : 'Success'}

`;

        if (item.error) {
            formatted += `Error: ${item.error}\n\n`;
        }

        if (item.result?.data) {
            if (Array.isArray(item.result.data)) {
                formatted += `Results: ${item.result.data.length} items\n\n`;
                
                item.result.data.forEach((dataItem, index) => {
                    formatted += `Item ${index + 1}:\n`;
                    formatted += `  GID: ${dataItem.gid || 'N/A'}\n`;
                    formatted += `  Name: ${dataItem.name || 'N/A'}\n`;
                    
                    // Add other common fields
                    if (dataItem.completed !== undefined) {
                        formatted += `  Completed: ${dataItem.completed}\n`;
                    }
                    if (dataItem.due_date) {
                        formatted += `  Due Date: ${dataItem.due_date}\n`;
                    }
                    if (dataItem.assignee?.name) {
                        formatted += `  Assignee: ${dataItem.assignee.name}\n`;
                    }
                    formatted += '\n';
                });
            } else {
                formatted += `Result:\n`;
                formatted += `  GID: ${item.result.data.gid || 'N/A'}\n`;
                formatted += `  Name: ${item.result.data.name || 'N/A'}\n`;
                
                Object.entries(item.result.data).forEach(([key, value]) => {
                    if (key !== 'gid' && key !== 'name' && value !== null && value !== undefined) {
                        formatted += `  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
                    }
                });
            }
        }

        formatted += '\n--- Raw JSON ---\n';
        formatted += JSON.stringify(item.result, null, 2);

        return formatted;
    }

    convertToCSV(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return '';
        }

        // Get all unique keys from all objects
        const allKeys = new Set();
        data.forEach(item => {
            Object.keys(item).forEach(key => {
                allKeys.add(key);
            });
        });

        const headers = Array.from(allKeys);
        
        // Create CSV content
        let csv = headers.join(',') + '\n';
        
        data.forEach(item => {
            const row = headers.map(header => {
                let value = item[header];
                
                // Handle complex objects
                if (typeof value === 'object' && value !== null) {
                    if (value.name) {
                        value = value.name; // For nested objects like assignee.name
                    } else if (value.gid) {
                        value = value.gid; // For nested objects with GID
                    } else {
                        value = JSON.stringify(value);
                    }
                }
                
                // Escape commas and quotes
                if (typeof value === 'string') {
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = '"' + value.replace(/"/g, '""') + '"';
                    }
                }
                
                return value || '';
            });
            
            csv += row.join(',') + '\n';
        });

        return csv;
    }

    fallbackCopyToClipboard(text) {
        // Create a temporary textarea element
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }

    showCopyFeedback(itemId, format) {
        // Find the copy button that was clicked and show feedback
        const buttons = document.querySelectorAll(`[onclick*="copySequenceResult('${itemId}', '${format}')"]`);
        buttons.forEach(button => {
            const originalText = button.textContent;
            button.textContent = '✅ Copied!';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        });

        // Show success message
        const formatNames = {
            json: 'JSON',
            formatted: 'Formatted Text',
            csv: 'CSV',
            error: 'Error Details'
        };
        
        this.showSequenceMessage(`✅ ${formatNames[format]} copied to clipboard!`, 'success');
    }

    convertParametersForExport(parameters, stepIndex) {
        console.log(`Converting parameters for export at step ${stepIndex}:`, parameters);
        
        const exportParams = {
            path: { ...parameters.path },
            query: { ...parameters.query },
            body: parameters.body
        };

        // Convert runtime sequence IDs to stable step references
        Object.keys(exportParams.path).forEach(key => {
            if (exportParams.path[key]) {
                const original = exportParams.path[key];
                exportParams.path[key] = this.convertVariableToStepReference(exportParams.path[key], stepIndex);
                console.log(`  Path ${key}: ${original} → ${exportParams.path[key]}`);
            }
        });

        Object.keys(exportParams.query).forEach(key => {
            if (exportParams.query[key]) {
                const original = exportParams.query[key];
                exportParams.query[key] = this.convertVariableToStepReference(exportParams.query[key], stepIndex);
                console.log(`  Query ${key}: ${original} → ${exportParams.query[key]}`);
            }
        });

        if (exportParams.body) {
            const original = exportParams.body;
            exportParams.body = this.convertVariableToStepReference(exportParams.body, stepIndex);
            console.log(`  Body: ${original.substring(0, 100)} → ${exportParams.body.substring(0, 100)}`);
        }

        console.log('Converted parameters:', exportParams);
        return exportParams;
    }

    convertVariableMappingsForExport(variableMappings, stepIndex) {
        console.log(`Converting variable mappings for export at step ${stepIndex}:`, variableMappings);
        const exportMappings = { ...variableMappings };
        
        Object.keys(exportMappings).forEach(key => {
            if (exportMappings[key]) {
                const originalValue = exportMappings[key];
                // Variable mappings are stored as raw values like "seq_123.data[0].gid"
                // but convertVariableToStepReference expects "{{seq_123.data[0].gid}}"
                // So we need to wrap them in curly braces for conversion, then unwrap
                let wrappedValue = originalValue;
                if (!originalValue.startsWith('{{')) {
                    wrappedValue = `{{${originalValue}}}`;
                }
                
                const converted = this.convertVariableToStepReference(wrappedValue, stepIndex);
                
                // Remove the curly braces for storage
                if (converted.startsWith('{{') && converted.endsWith('}}')) {
                    exportMappings[key] = converted.slice(2, -2);
                } else {
                    exportMappings[key] = converted;
                }
                
                console.log(`  Converted mapping ${key}: "${originalValue}" → "${exportMappings[key]}"`);
            }
        });

        console.log(`Final converted mappings:`, exportMappings);
        return exportMappings;
    }

    convertVariableToStepReference(value, currentStepIndex) {
        if (typeof value !== 'string') {
            console.log(`Not a string, returning as-is:`, value);
            return value;
        }

        console.log(`Converting variable to step reference: "${value}" (current step: ${currentStepIndex})`);

        // Convert {{seq_123456.data[0].gid}} to {{step0.data[0].gid}}
        const variablePattern = /\{\{(seq_[a-zA-Z0-9_]+)(\..*?)\}\}/g;
        
        const converted = value.replace(variablePattern, (match, sequenceId, path) => {
            console.log(`  Found variable pattern: ${match}, sequenceId: ${sequenceId}, path: ${path}`);
            
            // Find the step index for this sequence ID
            const stepIndex = this.apiSequence.findIndex(item => item.id === sequenceId);
            console.log(`  Step index for ${sequenceId}: ${stepIndex} (current step: ${currentStepIndex})`);
            
            if (stepIndex !== -1 && stepIndex < currentStepIndex) {
                const result = `{{step${stepIndex}${path}}}`;
                console.log(`  Converting runtime ID to step reference: ${match} → ${result}`);
                return result;
            }
            
            // If we can't find it, try to extract step number from existing step reference
            const stepPattern = /step(\d+)/;
            const stepMatch = sequenceId.match(stepPattern);
            if (stepMatch) {
                console.log(`  Already a step reference: ${match}`);
                return `{{step${stepMatch[1]}${path}}}`;
            }
            
            console.log(`  Cannot convert, returning original: ${match}`);
            return match; // Return original if we can't convert
        });

        console.log(`Final converted value: "${converted}"`);
        return converted;
    }

    debugExportConversion() {
        console.log('=== DEBUG EXPORT CONVERSION ===');
        console.log('Current sequence:', this.apiSequence.map(item => ({
            id: item.id,
            method: item.endpoint.method,
            path: item.endpoint.path,
            parameters: item.parameters,
            variableMappings: item.variableMappings
        })));

        // Test the conversion on each item
        this.apiSequence.forEach((item, index) => {
            console.log(`\n--- Testing conversion for step ${index} (${item.id}) ---`);
            console.log('Original parameters:', item.parameters);
            console.log('Original variable mappings:', item.variableMappings);
            
            const convertedParams = this.convertParametersForExport(item.parameters, index);
            console.log('Converted parameters:', convertedParams);
            
            if (item.variableMappings) {
                const convertedMappings = this.convertVariableMappingsForExport(item.variableMappings, index);
                console.log('Converted variable mappings:', convertedMappings);
            }
        });

        // Test a specific variable conversion
        const testVariable = "{{seq_test123.data[0].gid}}";
        console.log(`\nTesting specific variable: ${testVariable}`);
        const convertedTest = this.convertVariableToStepReference(testVariable, 1);
        console.log(`Result: ${convertedTest}`);

        // Test variable mapping conversion specifically
        const testMapping = { workspace_gid: "seq_test123.data[0].gid" };
        console.log(`\nTesting variable mapping: ${JSON.stringify(testMapping)}`);
        const convertedMapping = this.convertVariableMappingsForExport(testMapping, 1);
        console.log(`Result: ${JSON.stringify(convertedMapping)}`);

        console.log('=== END DEBUG ===');
    }

    convertParametersForImport(parameters, stepIndex) {
        const importParams = {
            path: { ...parameters.path },
            query: { ...parameters.query },
            body: parameters.body
        };

        // Convert stable step references back to runtime sequence IDs
        Object.keys(importParams.path).forEach(key => {
            if (importParams.path[key]) {
                importParams.path[key] = this.convertStepReferenceToVariable(importParams.path[key], stepIndex);
            }
        });

        Object.keys(importParams.query).forEach(key => {
            if (importParams.query[key]) {
                importParams.query[key] = this.convertStepReferenceToVariable(importParams.query[key], stepIndex);
            }
        });

        if (importParams.body) {
            importParams.body = this.convertStepReferenceToVariable(importParams.body, stepIndex);
        }

        return importParams;
    }

    convertVariableMappingsForImport(variableMappings, stepIndex) {
        console.log(`Converting variable mappings for import at step ${stepIndex}:`, variableMappings);
        const importMappings = { ...variableMappings };
        
        Object.keys(importMappings).forEach(key => {
            if (importMappings[key]) {
                const originalValue = importMappings[key];
                // Variable mappings are stored as raw values like "step0.data[0].gid"
                // but convertStepReferenceToVariable expects "{{step0.data[0].gid}}"
                let wrappedValue = originalValue;
                if (!originalValue.startsWith('{{')) {
                    wrappedValue = `{{${originalValue}}}`;
                }
                
                const converted = this.convertStepReferenceToVariable(wrappedValue, stepIndex);
                
                // Remove the curly braces for storage
                if (converted.startsWith('{{') && converted.endsWith('}}')) {
                    importMappings[key] = converted.slice(2, -2);
                } else {
                    importMappings[key] = converted;
                }
                
                console.log(`  Converted mapping ${key}: "${originalValue}" → "${importMappings[key]}"`);
            }
        });

        console.log(`Final converted mappings:`, importMappings);
        return importMappings;
    }

    convertStepReferenceToVariable(value, currentStepIndex) {
        if (typeof value !== 'string') return value;

        // Convert {{step0.data[0].gid}} to {{seq_123456.data[0].gid}} using actual sequence IDs
        const stepPattern = /\{\{step(\d+)(\..*?)\}\}/g;
        
        const converted = value.replace(stepPattern, (match, stepIndex, path) => {
            const stepNum = parseInt(stepIndex);
            if (stepNum < currentStepIndex && stepNum < this.apiSequence.length) {
                const referencedItem = this.apiSequence[stepNum];
                const result = `{{${referencedItem.id}${path}}}`;
                console.log(`Converting step reference: ${match} → ${result}`);
                return result;
            }
            return match; // Return original if we can't convert
        });

        return converted;
    }

    async copyAllResults() {
        const executedItems = this.apiSequence.filter(item => item.executed);
        
        if (executedItems.length === 0) {
            this.showSequenceMessage('❌ No executed sequence results to copy', 'error');
            return;
        }

        const timestamp = new Date().toISOString();
        let allResults = `Asana API Sequence Results
Generated: ${timestamp}
Total Steps: ${this.apiSequence.length}
Executed Steps: ${executedItems.length}

===============================================

`;

        executedItems.forEach((item, index) => {
            allResults += `Step ${this.apiSequence.indexOf(item) + 1}: ${item.endpoint.method} ${item.endpoint.path}
Summary: ${item.endpoint.summary}
Status: ${item.error ? 'ERROR' : 'SUCCESS'}

`;

            if (item.error) {
                allResults += `Error: ${item.error}\n\n`;
            } else if (item.result) {
                if (item.result.data && Array.isArray(item.result.data)) {
                    allResults += `Results: ${item.result.data.length} items\n`;
                    
                    // Show first few items as preview
                    const preview = item.result.data.slice(0, 3);
                    preview.forEach((dataItem, i) => {
                        allResults += `  ${i + 1}. ${dataItem.name || dataItem.gid || 'Unnamed'}\n`;
                    });
                    
                    if (item.result.data.length > 3) {
                        allResults += `  ... and ${item.result.data.length - 3} more items\n`;
                    }
                } else if (item.result.data) {
                    allResults += `Result: ${item.result.data.name || item.result.data.gid || 'Single item'}\n`;
                }
                allResults += '\n';
            }

            allResults += '--- Raw JSON ---\n';
            allResults += JSON.stringify(item.result, null, 2);
            allResults += '\n\n===============================================\n\n';
        });

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(allResults);
            } else {
                this.fallbackCopyToClipboard(allResults);
            }
            
            this.showSequenceMessage(`✅ All results (${executedItems.length} steps) copied to clipboard!`, 'success');
        } catch (error) {
            console.error('Copy all results failed:', error);
            this.showSequenceMessage('❌ Failed to copy results to clipboard', 'error');
        }
    }

    restoreParametersToForms() {
        this.apiSequence.forEach(item => {
            console.log(`Restoring parameters for item ${item.id}:`, item.parameters);

            // Restore path parameters
            if (item.parameters.path) {
                Object.entries(item.parameters.path).forEach(([param, value]) => {
                    const input = document.getElementById(`seq-path-${param}-${item.id}`);
                    if (input) {
                        input.value = value || '';
                        console.log(`Restored path param ${param}: ${value}`);
                    }
                });
            }

            // Restore query parameters
            if (item.parameters.query) {
                Object.entries(item.parameters.query).forEach(([param, value]) => {
                    const input = document.getElementById(`seq-query-${param}-${item.id}`);
                    if (input) {
                        input.value = value || '';
                        console.log(`Restored query param ${param}: ${value}`);
                    }
                });
            }

            // Restore body parameter
            if (item.parameters.body) {
                const textarea = document.getElementById(`seq-body-${item.id}`);
                if (textarea) {
                    textarea.value = item.parameters.body;
                    console.log(`Restored body parameter:`, item.parameters.body.substring(0, 100));
                }
            }

            // Restore path parameter variable mappings
            if (item.variableMappings) {
                Object.entries(item.variableMappings).forEach(([param, variablePath]) => {
                    const select = document.getElementById(`mapping-${item.id}-${param}`);
                    if (select) {
                        select.value = variablePath;
                        console.log(`Restored path variable mapping ${param}: ${variablePath}`);
                    }
                });
            }

            // Restore query parameter variable mappings
            if (item.parameters.query) {
                Object.entries(item.parameters.query).forEach(([param, value]) => {
                    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
                        const match = value.match(/\{\{([^}]+)\}\}/);
                        if (match) {
                            const variablePath = match[1];
                            const select = document.getElementById(`query-mapping-${item.id}-${param}`);
                            if (select) {
                                select.value = variablePath;
                                console.log(`Restored query variable mapping ${param}: ${variablePath}`);
                            }
                        }
                    }
                });
            }

            // Update the parameter summary to reflect restored values
            this.updateParameterSummaryOnly(item);
        });

        console.log('Parameter values restored to form fields');
    }

    renderVariableMappings(item, itemIndex, availableVariables) {
        const pathParams = this.extractPathParameters(item.endpoint.path);
        if (pathParams.length === 0) {
            return '';
        }

        // For imported sequences, also include stored variable mappings that might not be in availableVariables yet
        const allVariableOptions = [...availableVariables];
        
        // Add any variable mappings from the imported sequence that aren't in availableVariables
        if (item.variableMappings) {
            Object.entries(item.variableMappings).forEach(([param, variablePath]) => {
                if (variablePath && !allVariableOptions.find(v => v.path === variablePath)) {
                    allVariableOptions.push({
                        path: variablePath,
                        description: `Imported mapping`,
                        example: 'Not executed yet'
                    });
                }
            });
        }

        return `
            <div class="variable-mapping">
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">Variable Mapping</div>
                ${pathParams.map(param => `
                    <div style="margin-bottom: 8px;">
                        <label>Map {${param}} to:</label>
                        <select id="mapping-${item.id}-${param}" onchange="explorer.updateVariableMapping('${item.id}', '${param}', this.value)">
                            <option value="">Use original value: ${item.parameters.path[param] || 'Not set'}</option>
                            ${allVariableOptions.map(variable => `
                                <option value="${variable.path}" ${item.variableMappings[param] === variable.path ? 'selected' : ''}>
                                    ${variable.description} (${variable.example})
                                </option>
                            `).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
        `;
    }

    updateVariableMapping(itemId, paramName, variablePath) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (item) {
            if (variablePath) {
                item.variableMappings[paramName] = variablePath;
            } else {
                delete item.variableMappings[paramName];
            }
        }
    }

    async executeSequence() {
        if (this.apiSequence.length === 0) {
            alert('No endpoints in sequence to execute.');
            return;
        }

        if (!this.personalAccessToken) {
            alert('Personal Access Token is required to execute the sequence.');
            return;
        }

        console.log('🚀 Starting full sequence execution...');
        
        // Show progress indication
        const executeBtn = document.querySelector('button[onclick="explorer.executeSequence()"]');
        const originalText = executeBtn.innerHTML;
        
        for (let i = 0; i < this.apiSequence.length; i++) {
            const item = this.apiSequence[i];
            
            // Update button to show progress
            executeBtn.innerHTML = `⏳ Executing ${i + 1}/${this.apiSequence.length}`;
            executeBtn.disabled = true;
            
            console.log(`📡 Executing step ${i + 1}: ${item.endpoint.method} ${item.endpoint.path}`);
            
            try {
                await this.executeSequenceItem(item.id);
                
                if (item.error) {
                    console.error(`❌ Sequence stopped at step ${i + 1} due to error:`, item.error);
                    alert(`Sequence execution stopped at step ${i + 1} due to an error. Check the console for details.`);
                    break;
                }
                
                console.log(`✅ Step ${i + 1} completed successfully`);
                
                // Add a small delay between calls to be respectful to the API
                if (i < this.apiSequence.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
            } catch (error) {
                console.error(`❌ Sequence stopped at step ${i + 1}:`, error);
                alert(`Sequence execution failed at step ${i + 1}: ${error.message}`);
                break;
            }
        }
        
        // Restore button
        executeBtn.innerHTML = originalText;
        executeBtn.disabled = false;
        
        console.log('🏁 Sequence execution completed');
        
        // Check if all items completed successfully
        const completedItems = this.apiSequence.filter(item => item.executed && !item.error);
        if (completedItems.length === this.apiSequence.length) {
            console.log(`🎉 All ${completedItems.length} steps completed successfully!`);
        } else {
            console.log(`⚠️ Sequence completed with ${completedItems.length}/${this.apiSequence.length} successful steps`);
        }
        
        // Auto-refresh field mapping options if there are imported field mappings and transformation panel is visible
        const transformSection = document.getElementById('dataTransformation');
        const hasFieldMappings = this.dataTransformations.fieldMappings.length > 0;
        const transformationVisible = transformSection && transformSection.style.display !== 'none';
        
        if (hasFieldMappings && transformationVisible && completedItems.length > 0) {
            console.log('🔄 Auto-refreshing field mapping options after sequence execution');
            setTimeout(() => {
                this.renderFieldMappings();
                
                // Show a subtle notification that field options were updated
                const headerElement = transformSection.querySelector('.transformation-header h4');
                if (headerElement) {
                    const originalText = headerElement.innerHTML;
                    headerElement.innerHTML = `🔄 Data Transformation - Field Options Updated`;
                    headerElement.style.color = '#28a745';
                    
                    // Restore original text after 2 seconds
                    setTimeout(() => {
                        headerElement.innerHTML = originalText;
                        headerElement.style.color = '';
                    }, 2000);
                }
            }, 200);
        }
    }

    async executeSequenceItem(itemId) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item) return;

        try {
            // Reset previous state
            item.executed = false;
            item.result = null;
            item.error = null;

            // Set current sequence item context for parameter building
            this.currentSequenceItem = item;

            // Build URL with variable substitution
            let url = `${this.baseUrl}${item.endpoint.path}`;
            
            // Apply variable mappings to path parameters
            const pathParams = this.extractPathParameters(item.endpoint.path);
            pathParams.forEach(param => {
                let value = item.parameters.path[param];
                
                // Check if there's a variable mapping
                if (item.variableMappings[param]) {
                    value = this.resolveVariable(item.variableMappings[param]);
                }
                
                // Check if value contains variable placeholder
                if (typeof value === 'string' && value && value.includes('{{') && value.includes('}}')) {
                    value = this.resolveVariablePlaceholder(value);
                }
                
                if (value) {
                    url = url.replace(`{${param}}`, encodeURIComponent(value));
                }
            });

            // Build query parameters with variable substitution
            const queryParams = this.buildQueryParameters(-1); // Use -1 to indicate sequence execution
            
            if (queryParams.toString()) {
                url += `?${queryParams.toString()}`;
            }

            // Prepare request
            const fetchOptions = {
                method: item.endpoint.method,
                headers: {
                    'Authorization': `Bearer ${this.personalAccessToken}`,
                    'Accept': 'application/json'
                }
            };

            if (item.parameters.body && ['POST', 'PUT', 'PATCH'].includes(item.endpoint.method)) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = item.parameters.body;
            }

            // Execute request
            const response = await fetch(url, fetchOptions);
            const responseData = await response.json();

            if (response.ok) {
                item.result = responseData;
                item.executed = true;
                this.sequenceResults.set(item.id, responseData);
            } else {
                item.error = `${response.status}: ${responseData.errors?.[0]?.message || 'API call failed'}`;
                item.executed = true;
            }

        } catch (error) {
            item.error = `Network Error: ${error.message}`;
            item.executed = true;
        } finally {
            // Clear sequence item context
            this.currentSequenceItem = null;
        }

        this.renderSequence();
    }

    resolveVariable(variablePath) {
        const [itemId, ...pathParts] = variablePath.split('.');
        const result = this.sequenceResults.get(itemId);
        
        console.log(`Resolving variable path: ${variablePath}`);
        console.log(`ItemId: ${itemId}, Available results:`, Array.from(this.sequenceResults.keys()));
        
        if (!result) {
            console.log(`No result found for itemId: ${itemId}`);
            return null;
        }
        
        let value = result;
        console.log(`Starting with result:`, result);
        
        for (const part of pathParts) {
            if (part.includes('[') && part.includes(']')) {
                // Handle array access like data[0]
                const [arrayName, indexStr] = part.split('[');
                const index = parseInt(indexStr.replace(']', ''));
                value = value[arrayName]?.[index];
                console.log(`Accessing ${arrayName}[${index}]:`, value);
            } else {
                value = value[part];
                console.log(`Accessing ${part}:`, value);
            }
            
            if (value === undefined || value === null) {
                console.log(`Value became null/undefined at part: ${part}`);
                return null;
            }
        }
        
        console.log(`Final resolved value:`, value);
        return value;
    }

    removeFromSequence(itemId) {
        this.apiSequence = this.apiSequence.filter(item => item.id !== itemId);
        this.sequenceResults.delete(itemId);
        this.renderSequence();
    }

    clearSequence() {
        this.apiSequence = [];
        this.sequenceResults.clear();
        
        // Hide transformation panel since there's no more data to transform
        const transformSection = document.getElementById('dataTransformation');
        if (transformSection) {
            transformSection.style.display = 'none';
        }
        
        // Clear transformation data
        this.dataTransformations.fieldMappings = [];
        this.dataTransformations.unifiedColumns = [];
        this.transformedData = null;
        
        this.renderSequence();
    }

    exportSequence() {
        if (this.apiSequence.length === 0) {
            alert('No sequence to export. Add some endpoints first.');
            return;
        }

        const exportData = {
            version: "1.0",
            name: `Asana API Sequence - ${new Date().toLocaleDateString()}`,
            description: `API sequence with ${this.apiSequence.length} endpoints`,
            sequence: this.apiSequence.map((item, index) => ({
                method: item.endpoint.method,
                path: item.endpoint.path,
                summary: item.endpoint.summary,
                description: item.endpoint.description,
                tags: item.endpoint.tags,
                parameters: this.convertParametersForExport(item.parameters, index),
                variableMappings: this.convertVariableMappingsForExport(item.variableMappings, index)
            })),
            dataTransformations: {
                fieldMappings: [...this.dataTransformations.fieldMappings],
                unifiedColumns: [...this.dataTransformations.unifiedColumns]
            },
            timestamp: new Date().toISOString(),
            baseUrl: this.baseUrl
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asana-api-sequence-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Show success message
        this.showSequenceMessage('✅ Sequence exported successfully!', 'success');
    }

    importSequence() {
        const fileInput = document.getElementById('sequenceFileInput');
        fileInput.click();
    }

    handleSequenceFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'application/json') {
            this.showSequenceMessage('❌ Please select a JSON file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importData = JSON.parse(e.target.result);
                this.loadSequenceFromData(importData);
            } catch (error) {
                this.showSequenceMessage('❌ Invalid JSON file format.', 'error');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);

        // Clear the file input for next use
        event.target.value = '';
    }

    loadSequenceFromData(importData) {
        try {
            // Validate import data structure
            if (!importData.sequence || !Array.isArray(importData.sequence)) {
                throw new Error('Invalid sequence format: missing or invalid sequence array');
            }

            // Clear existing sequence if user confirms
            if (this.apiSequence.length > 0) {
                if (!confirm('This will replace your current sequence. Continue?')) {
                    return;
                }
            }

            // Clear current state
            this.clearSequence();

            // Convert imported data to internal format
            let loadedCount = 0;
            let skippedCount = 0;

            importData.sequence.forEach((importItem, index) => {
                try {
                    // Find matching endpoint in current endpoints
                    const matchingEndpoint = this.endpoints.find(ep => 
                        ep.method === importItem.method && ep.path === importItem.path
                    );

                    if (matchingEndpoint) {
                        // Create sequence item first
                        const sequenceItem = {
                            id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            endpoint: matchingEndpoint,
                            endpointIndex: -1, // Will be set when needed
                            parameters: {
                                path: {},
                                query: {},
                                body: null
                            },
                            variableMappings: {},
                            executed: false,
                            result: null,
                            error: null
                        };

                        // Add to sequence first so we have the correct order
                        this.apiSequence.push(sequenceItem);

                        // Now convert the imported parameters using the current sequence context
                        sequenceItem.parameters = this.convertParametersForImport(
                            importItem.parameters || { path: {}, query: {}, body: null }, 
                            this.apiSequence.length - 1
                        );
                        sequenceItem.variableMappings = this.convertVariableMappingsForImport(
                            importItem.variableMappings || {}, 
                            this.apiSequence.length - 1
                        );

                        loadedCount++;
                    } else {
                        // Create a placeholder endpoint if not found
                        const placeholderEndpoint = {
                            method: importItem.method,
                            path: importItem.path,
                            summary: importItem.summary || 'Imported endpoint',
                            description: importItem.description || 'This endpoint was imported but not found in current API spec',
                            tags: importItem.tags || ['imported'],
                            operationId: `imported_${index}`,
                            security: ['oauth2']
                        };

                        const sequenceItem = {
                            id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            endpoint: placeholderEndpoint,
                            endpointIndex: -1,
                            parameters: importItem.parameters || { path: {}, query: {}, body: null },
                            variableMappings: importItem.variableMappings || {},
                            executed: false,
                            result: null,
                            error: null,
                            isImported: true // Flag to indicate this was imported
                        };

                        this.apiSequence.push(sequenceItem);
                        loadedCount++;
                    }
                } catch (itemError) {
                    console.warn(`Skipping invalid sequence item ${index}:`, itemError);
                    skippedCount++;
                }
            });

            // Show results
            if (loadedCount > 0) {
                this.renderSequence();
                
                // Check if transformation settings were also imported
                const hasImportedTransformations = importData.dataTransformations && 
                    (importData.dataTransformations.fieldMappings?.length > 0 || 
                     importData.dataTransformations.unifiedColumns?.length > 0);
                
                let message = skippedCount > 0 
                    ? `✅ Loaded ${loadedCount} endpoints (${skippedCount} skipped due to errors)`
                    : `✅ Successfully loaded ${loadedCount} endpoints`;
                    
                if (hasImportedTransformations) {
                    const transformationCount = (importData.dataTransformations.fieldMappings?.length || 0) +
                                              (importData.dataTransformations.unifiedColumns?.length || 0);
                    message += ` and ${transformationCount} transformation setting${transformationCount !== 1 ? 's' : ''}`;
                }
                
                this.showSequenceMessage(message, 'success');

                // Auto-open sequence panel
                if (!this.sequencePanelOpen) {
                    this.toggleSequencePanel();
                }

                // Check if sequence has variable mappings and suggest execution
                const hasVariableMappings = this.apiSequence.some(item => 
                    item.variableMappings && Object.keys(item.variableMappings).length > 0
                );
                
                if (hasVariableMappings && this.personalAccessToken) {
                    setTimeout(() => {
                        if (confirm('This sequence has variable mappings configured. Would you like to execute the full sequence now?')) {
                            this.executeSequence();
                        }
                    }, 1000);
                } else if (hasVariableMappings && !this.personalAccessToken) {
                    setTimeout(() => {
                        alert('This sequence has variable mappings configured. Set your Personal Access Token to execute the full sequence.');
                    }, 1000);
                }

                // Load transformation settings if available
                if (importData.dataTransformations) {
                    this.dataTransformations.fieldMappings = importData.dataTransformations.fieldMappings || [];
                    this.dataTransformations.unifiedColumns = importData.dataTransformations.unifiedColumns || [];
                    console.log('Loaded transformation settings:', this.dataTransformations);
                    
                    // Auto-show transformation panel if we have settings
                    const hasTransformations = this.dataTransformations.fieldMappings.length > 0 || 
                                             this.dataTransformations.unifiedColumns.length > 0;
                    
                    if (hasTransformations) {
                        console.log('Auto-showing transformation panel with imported settings');
                        setTimeout(() => {
                            // Show the panel and ensure field mappings are rendered
                            const transformSection = document.getElementById('dataTransformation');
                            if (transformSection) {
                                transformSection.style.display = 'block';
                                
                                // Render the imported field mappings
                                this.renderFieldMappings();
                                
                                // Update header appropriately
                                const headerElement = transformSection.querySelector('.transformation-header h4');
                                if (headerElement) {
                                    headerElement.innerHTML = `🔄 Data Transformation - Imported Settings`;
                                }
                                
                                // Scroll to transformation section
                                transformSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }
                        }, 800); // Increased delay to ensure DOM is fully ready
                    }
                }

                // Restore parameter values to form fields after a short delay
                setTimeout(() => {
                    this.restoreParametersToForms();
                }, 200);
            } else {
                this.showSequenceMessage('❌ No valid endpoints found in the imported file.', 'error');
            }

        } catch (error) {
            this.showSequenceMessage('❌ Failed to import sequence: ' + error.message, 'error');
            console.error('Import error:', error);
        }
    }

    showSequenceMessage(message, type) {
        // Create a temporary message element
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 440px;
            background: ${type === 'success' ? '#d4edda' : '#f8d7da'};
            color: ${type === 'success' ? '#155724' : '#721c24'};
            border: 1px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'};
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 4000);
    }

    loadSampleSequence() {
        const sampleSequence = {
            version: "1.0",
            name: "Sample Workspace → Projects Flow",
            description: "Demonstrates workspace to projects API workflow pattern",
            sequence: [
                {
                    method: "GET",
                    path: "/workspaces",
                    summary: "Get available workspaces",
                    description: "Retrieves all workspaces accessible to the authenticated user",
                    tags: ["workspaces"],
                    parameters: {
                        path: {},
                        query: {
                            limit: "10",
                            opt_fields: "gid,name,is_organization"
                        },
                        body: null
                    },
                    variableMappings: {}
                },
                {
                    method: "GET", 
                    path: "/projects",
                    summary: "Get projects in workspace",
                    description: "Retrieves projects from the first workspace",
                    tags: ["projects"],
                    parameters: {
                        path: {},
                        query: {
                            limit: "5",
                            opt_fields: "gid,name,completed,archived",
                            workspace: "{{step0.data[0].gid}}"
                        },
                        body: null
                    },
                    variableMappings: {}
                }
            ],
            timestamp: new Date().toISOString(),
            baseUrl: "https://app.asana.com/api/1.0"
        };

        // Clear existing sequence if user confirms
        if (this.apiSequence.length > 0) {
            if (!confirm('This will replace your current sequence with a sample workflow. Continue?')) {
                return;
            }
        }

        // Process the sample sequence through the normal import flow
        this.loadSequenceFromData(sampleSequence);
        
        // After loading, set up variable mappings for the sample
        setTimeout(() => {
            this.setupSampleVariableMappings();
            // Ensure parameters are restored to forms
            setTimeout(() => {
                this.restoreParametersToForms();
            }, 100);
        }, 100);
    }

    setupSampleVariableMappings() {
        // The sample sequence already has the correct step references in the exported format
        // The import process will convert them to runtime IDs automatically
        
        // Re-render to show the updated parameters and mappings
        setTimeout(() => {
            this.renderSequence();
            this.showSequenceMessage('🎯 Sample sequence loaded! Step 2 will use workspace GID from step 1. Variable mappings are automatically configured.', 'success');
        }, 50);
    }

    // Grid View Methods
    showGridView() {
        const gridData = this.prepareGridData();
        if (gridData.length === 0) {
            alert('No sequence results available. Execute some endpoints first.');
            return;
        }

        // Show modal dialog
        const gridDialog = document.getElementById('gridDialog');
        const dialogTitle = document.getElementById('gridDialogTitle');
        
        dialogTitle.textContent = '📊 Grid View - All Sequence Results';
        gridDialog.style.display = 'flex';
        
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';

        // Check if Ignite UI grid is available, otherwise use fallback
        setTimeout(() => {
            const grid = document.getElementById('sequenceResultsGrid');
            if (grid && typeof grid.data !== 'undefined') {
                this.populateGrid(gridData);
            } else {
                console.warn('Ignite UI Grid not available, using fallback table');
                this.createFallbackTable(gridData);
            }
        }, 100);
    }

    closeGridDialog() {
        const gridDialog = document.getElementById('gridDialog');
        const modalContent = gridDialog.querySelector('.modal-content');
        
        // Restore body scrolling
        document.body.style.overflow = 'auto';
        
        // Remove maximized class if present
        modalContent.classList.remove('maximized');
        
        // Hide dialog
        gridDialog.style.display = 'none';
    }

    maximizeGrid() {
        const modalContent = document.querySelector('.modal-content');
        const maximizeBtn = document.getElementById('maximizeBtn');
        
        if (modalContent.classList.contains('maximized')) {
            modalContent.classList.remove('maximized');
            maximizeBtn.innerHTML = '⛶ Maximize';
        } else {
            modalContent.classList.add('maximized');
            maximizeBtn.innerHTML = '🗗 Restore';
        }
    }

    refreshGridData() {
        const gridData = this.prepareGridData();
        if (gridData.length === 0) {
            alert('No sequence results available.');
            return;
        }
        
        // Check if we're using Ignite UI grid or fallback table
        const grid = document.getElementById('sequenceResultsGrid');
        if (grid && typeof grid.data !== 'undefined') {
            this.populateGrid(gridData);
        } else {
            this.createFallbackTable(gridData);
        }
    }

    prepareGridData() {
        console.log('Preparing grid data from sequence:', this.apiSequence);
        const gridData = [];
        
        this.apiSequence.forEach((item, index) => {
            console.log(`Processing item ${index}:`, item);
            
            if (item.executed && item.result && item.result.data) {
                const stepData = {
                    'Step': index + 1,
                    'Endpoint': `${item.endpoint.method} ${item.endpoint.path}`,
                    'Status': item.error ? 'Error' : 'Success',
                    'Records': Array.isArray(item.result.data) ? item.result.data.length : 1
                };

                // If the result is an array, add each item as a separate row
                if (Array.isArray(item.result.data)) {
                    item.result.data.forEach((dataItem, dataIndex) => {
                        const flattened = this.flattenObject(dataItem, '');
                        const rowData = {
                            ...stepData,
                            'Row': dataIndex + 1,
                            ...flattened
                        };
                        gridData.push(rowData);
                    });
                } else {
                    // Single object result
                    const flattened = this.flattenObject(item.result.data, '');
                    const rowData = {
                        ...stepData,
                        'Row': 1,
                        ...flattened
                    };
                    gridData.push(rowData);
                }
            }
        });

        console.log('Prepared grid data:', gridData);
        return gridData;
    }

    flattenObject(obj, prefix = '', maxDepth = 3, currentDepth = 0) {
        const flattened = {};
        
        if (currentDepth >= maxDepth) {
            flattened[prefix.slice(0, -1)] = '[Object]';
            return flattened;
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix + key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    Object.assign(flattened, this.flattenObject(value, newKey + '_', maxDepth, currentDepth + 1));
                } else if (Array.isArray(value)) {
                    flattened[newKey] = `[Array(${value.length})]`;
                } else {
                    flattened[newKey] = value;
                }
            }
        }
        
        return flattened;
    }

    populateGrid(data) {
        console.log('📊 Populating grid with data:', data);
        const grid = document.getElementById('sequenceResultsGrid');
        if (!grid) {
            console.error('Grid element not found');
            return;
        }

        try {
            // Clear existing columns first
            if (grid.columns) {
                grid.columns.clear();
            }

            // Set auto-generate to false to have more control
            grid.autoGenerate = false;
            
            // Generate columns from data if we have data
            if (data && data.length > 0) {
                const firstRow = data[0];
                const columns = Object.keys(firstRow).map(key => ({
                    field: key,
                    header: key,
                    dataType: typeof firstRow[key] === 'number' ? 'number' : 'string',
                    sortable: true,
                    filterable: true,
                    resizable: true
                }));
                
                console.log('Generated columns:', columns);
                
                // Add columns to grid
                columns.forEach(col => {
                    const column = document.createElement('igc-column');
                    column.field = col.field;
                    column.header = col.header;
                    column.dataType = col.dataType;
                    column.sortable = col.sortable;
                    column.filterable = col.filterable;
                    column.resizable = col.resizable;
                    grid.appendChild(column);
                });
            }

            // Set the data
            grid.data = data;
            
            // Configure grid features
            grid.allowFiltering = true;
            grid.allowSorting = true;
            grid.allowColumnResizing = true;
            grid.height = '100%';
            grid.width = '100%';
            
            console.log(`📊 Grid populated successfully with ${data.length} rows`);
            
        } catch (error) {
            console.error('Error populating grid:', error);
            console.warn('Falling back to HTML table');
            this.createFallbackTable(data);
        }
    }

    createFallbackTable(data) {
        const gridContainer = document.getElementById('gridContainer');
        if (!data || data.length === 0) {
            gridContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No data available</div>';
            return;
        }

        // Get column names from first row
        const columns = Object.keys(data[0]);
        
        // Create table HTML
        let tableHTML = `
            <div style="height: 100%; overflow: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                        <tr>
                            ${columns.map(col => `<th style="border: 1px solid #dee2e6; padding: 8px; text-align: left; font-weight: 600;">${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        // Add data rows
        data.forEach((row, index) => {
            tableHTML += `<tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">`;
            columns.forEach(col => {
                let value = row[col];
                if (value === null || value === undefined) value = '';
                if (typeof value === 'object') value = JSON.stringify(value);
                tableHTML += `<td style="border: 1px solid #dee2e6; padding: 6px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${String(value).replace(/"/g, '&quot;')}">${value}</td>`;
            });
            tableHTML += '</tr>';
        });
        
        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;
        
        gridContainer.innerHTML = tableHTML;
        console.log(`📊 Fallback table created with ${data.length} rows`);
    }

    showItemInGrid(itemId) {
        const item = this.apiSequence.find(item => item.id === itemId);
        if (!item || !item.result || !item.result.data) {
            alert('No data available for this item.');
            return;
        }

        // Prepare data for single item
        const gridData = [];
        const stepIndex = this.apiSequence.indexOf(item);
        
        if (Array.isArray(item.result.data)) {
            item.result.data.forEach((dataItem, dataIndex) => {
                const rowData = {
                    'Step': stepIndex + 1,
                    'Endpoint': `${item.endpoint.method} ${item.endpoint.path}`,
                    'Row': dataIndex + 1,
                    ...this.flattenObject(dataItem)
                };
                gridData.push(rowData);
            });
        } else {
            const rowData = {
                'Step': stepIndex + 1,
                'Endpoint': `${item.endpoint.method} ${item.endpoint.path}`,
                'Row': 1,
                ...this.flattenObject(item.result.data)
            };
            gridData.push(rowData);
        }

        // Show modal dialog
        const gridDialog = document.getElementById('gridDialog');
        const dialogTitle = document.getElementById('gridDialogTitle');
        
        // Update dialog title to show which step is displayed
        dialogTitle.innerHTML = `📊 Step ${stepIndex + 1}: ${item.endpoint.method} ${item.endpoint.path}`;
        gridDialog.style.display = 'flex';
        
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';

        // Check if Ignite UI grid is available, otherwise use fallback
        setTimeout(() => {
            const grid = document.getElementById('sequenceResultsGrid');
            if (grid && typeof grid.data !== 'undefined') {
                this.populateGrid(gridData);
            } else {
                console.warn('Ignite UI Grid not available, using fallback table');
                this.createFallbackTable(gridData);
            }
        }, 100);
    }

    // Data Transformation Methods
    showTransformation() {
        // Check if we have sequence results
        const lastExecutedItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );
        
        if (!lastExecutedItem) {
            alert('Execute the sequence first to enable data transformation. Transformations are applied to the final result only.');
            return;
        }

        // Auto-populate field mappings from the final result only if no existing mappings
        if (this.dataTransformations.fieldMappings.length === 0 && this.dataTransformations.unifiedColumns.length === 0) {
            this.autoPopulateFieldMappings();
        }
        
        this.showTransformationPanel();
    }

    showTransformationPanel() {
        // Show transformation panel
        const transformSection = document.getElementById('dataTransformation');
        transformSection.style.display = 'block';
        
        // Scroll to transformation section
        transformSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        this.renderFieldMappings();
        
        // Update transformation header to show which step is being transformed
        const lastExecutedItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );
        
        if (lastExecutedItem) {
            const stepIndex = this.apiSequence.indexOf(lastExecutedItem);
            const headerElement = transformSection.querySelector('.transformation-header h4');
            if (headerElement) {
                headerElement.innerHTML = `🔄 Data Transformation - Step ${stepIndex + 1} (Final Result)`;
            }
        }
    }

    toggleTransformation() {
        const transformSection = document.getElementById('dataTransformation');
        transformSection.style.display = 'none';
    }

    autoPopulateFieldMappings() {
        // Get the last executed item with results (final sequence result)
        const lastItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );
        
        if (!lastItem) return;

        // Clear existing mappings
        this.dataTransformations.fieldMappings = [];
        
        // Get sample data from final result to extract field names
        let sampleData = lastItem.result.data;
        if (Array.isArray(sampleData) && sampleData.length > 0) {
            sampleData = sampleData[0];
        }
        
        // Create field mappings from the final result's sample data
        const flattenedFields = this.flattenObject(sampleData);
        Object.keys(flattenedFields).forEach(field => {
            this.dataTransformations.fieldMappings.push({
                sourceField: field,
                targetField: field, // Default to same name
                isUnified: false
            });
        });
    }

    addFieldMapping() {
        this.dataTransformations.fieldMappings.push({
            sourceField: '',
            targetField: '',
            isUnified: false
        });
        this.renderFieldMappings();
    }

    addUnifiedColumn() {
        this.dataTransformations.unifiedColumns.push({
            name: 'unified_field',
            formatTemplate: '{field1} - {field2}',
            sourceFields: []
        });
        this.renderFieldMappings();
    }

    removeFieldMapping(index) {
        this.dataTransformations.fieldMappings.splice(index, 1);
        this.renderFieldMappings();
    }

    removeUnifiedColumn(index) {
        this.dataTransformations.unifiedColumns.splice(index, 1);
        this.renderFieldMappings();
    }

    renderFieldMappings() {
        const container = document.getElementById('fieldMappings');
        const availableFields = this.getAvailableFields();
        const fieldOptions = availableFields.map(field => `<option value="${field}">${field}</option>`).join('');
        
        let html = '';

        // Show available fields info or execution status
        if (availableFields.length > 0) {
            html += `
                <div style="font-size: 11px; color: #666; margin-bottom: 0.5rem; padding: 0.25rem; background: #f8f9fa; border-radius: 3px;">
                    Available fields: ${availableFields.slice(0, 8).join(', ')}${availableFields.length > 8 ? '...' : ''}
                </div>
            `;
        } else if (this.dataTransformations.fieldMappings.length > 0) {
            html += `
                <div style="font-size: 11px; color: #ffc107; margin-bottom: 0.5rem; padding: 0.25rem; background: #fff3cd; border-radius: 3px; border-left: 3px solid #ffc107;">
                    ⚠️ Execute the sequence to populate field options in the dropdowns
                </div>
            `;
        }

        // Render regular field mappings
        this.dataTransformations.fieldMappings.forEach((mapping, index) => {
            // Create a combined list of available fields and the current mapping's sourceField (if not already included)
            const allFields = [...availableFields];
            if (mapping.sourceField && !availableFields.includes(mapping.sourceField)) {
                allFields.unshift(mapping.sourceField); // Add at beginning
            }
            
            // Generate field options with proper selection
            const fieldOptionsWithSelection = allFields.map(field => {
                const selected = field === mapping.sourceField ? 'selected' : '';
                const isImported = !availableFields.includes(field) && field === mapping.sourceField;
                const label = isImported ? `${field} (imported)` : field;
                return `<option value="${field}" ${selected}>${label}</option>`;
            }).join('');
            
            html += `
                <div class="field-mapping-item">
                    <select onchange="explorer.updateFieldMapping(${index}, 'sourceField', this.value)">
                        <option value="">Select Source Field</option>
                        ${fieldOptionsWithSelection}
                    </select>
                    <span style="color: #666;">→</span>
                    <input type="text" placeholder="Target Field" value="${mapping.targetField}" 
                           onchange="explorer.updateFieldMapping(${index}, 'targetField', this.value)">
                    <button class="remove-mapping-btn" onclick="explorer.removeFieldMapping(${index})" title="Remove">×</button>
                </div>
            `;
        });

        // Render unified columns
        this.dataTransformations.unifiedColumns.forEach((unified, index) => {
            html += `
                <div class="field-mapping-item unified-column">
                    <input type="text" placeholder="Column Name" value="${unified.name}" 
                           onchange="explorer.updateUnifiedColumn(${index}, 'name', this.value)">
                    <span style="color: #007bff;">🔗</span>
                    <input type="text" class="format-template" placeholder="Format: {field1} - {field2}" 
                           value="${unified.formatTemplate}" 
                           onchange="explorer.updateUnifiedColumn(${index}, 'formatTemplate', this.value)"
                           title="Use {fieldName} to reference fields. Available: ${availableFields.join(', ')}">
                    <button class="remove-mapping-btn" onclick="explorer.removeUnifiedColumn(${index})" title="Remove">×</button>
                </div>
            `;
        });

        if (this.dataTransformations.fieldMappings.length === 0 && this.dataTransformations.unifiedColumns.length === 0) {
            html += '<div style="text-align: center; color: #666; padding: 1rem;">No field mappings yet. Click "Add Field Mapping" to start.</div>';
        }

        container.innerHTML = html;
    }

    updateFieldMapping(index, field, value) {
        if (this.dataTransformations.fieldMappings[index]) {
            this.dataTransformations.fieldMappings[index][field] = value;
        }
    }

    updateUnifiedColumn(index, field, value) {
        if (this.dataTransformations.unifiedColumns[index]) {
            this.dataTransformations.unifiedColumns[index][field] = value;
        }
    }

    previewTransformation() {
        try {
            const transformedData = this.applyTransformation();
            if (transformedData.length === 0) {
                alert('No final sequence data to transform. Execute the sequence first.');
                return;
            }

            // Show preview in console
            console.log('🔄 Transformed Final Result Preview:', transformedData.slice(0, 5));
            alert(`Final result transformation preview generated! Check console for ${transformedData.length} transformed records from the last step. First 5 records are shown.`);
        } catch (error) {
            console.error('Transformation error:', error);
            alert('Transformation failed: ' + error.message);
        }
    }

    applyAndShowGrid() {
        try {
            const transformedData = this.applyTransformation();
            if (transformedData.length === 0) {
                alert('No final sequence data to transform. Execute the sequence first.');
                return;
            }

            // Show in grid modal
            const gridDialog = document.getElementById('gridDialog');
            const dialogTitle = document.getElementById('gridDialogTitle');
            
            dialogTitle.innerHTML = '📊 Transformed Final Result';
            gridDialog.style.display = 'flex';
            
            // Prevent body scrolling when modal is open
            document.body.style.overflow = 'hidden';

            // Populate grid with transformed data
            setTimeout(() => {
                const grid = document.getElementById('sequenceResultsGrid');
                if (grid && typeof grid.data !== 'undefined') {
                    this.populateGrid(transformedData);
                } else {
                    this.createFallbackTable(transformedData);
                }
            }, 100);

        } catch (error) {
            console.error('Transformation error:', error);
            alert('Transformation failed: ' + error.message);
        }
    }

    applyTransformation() {
        // Get the last executed item with results (final result of sequence)
        const lastExecutedItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );

        if (!lastExecutedItem) {
            return [];
        }

        // Get data from the final step only
        let finalData = lastExecutedItem.result.data;
        
        // Ensure it's an array
        if (!Array.isArray(finalData)) {
            finalData = [finalData];
        }

        // Prepare the data with metadata
        const allData = finalData.map((record, recordIndex) => {
            const flatRecord = this.flattenObject(record);
            const stepIndex = this.apiSequence.indexOf(lastExecutedItem);
            flatRecord._step = stepIndex + 1;
            flatRecord._record = recordIndex + 1;
            flatRecord._endpoint = `${lastExecutedItem.endpoint.method} ${lastExecutedItem.endpoint.path}`;
            return flatRecord;
        });

        if (allData.length === 0) {
            return [];
        }

        // Apply field mappings
        const transformedData = allData.map(record => {
            const transformed = {};
            
            // Apply regular field mappings
            this.dataTransformations.fieldMappings.forEach(mapping => {
                if (mapping.sourceField && mapping.targetField) {
                    transformed[mapping.targetField] = record[mapping.sourceField] || '';
                }
            });
            
            // Apply unified columns
            this.dataTransformations.unifiedColumns.forEach(unified => {
                if (unified.name && unified.formatTemplate) {
                    let formattedValue = unified.formatTemplate;
                    
                    // Replace {fieldName} placeholders with actual values
                    const matches = formattedValue.match(/\{([^}]+)\}/g);
                    if (matches) {
                        matches.forEach(match => {
                            const fieldName = match.slice(1, -1);
                            const fieldValue = record[fieldName] || '';
                            formattedValue = formattedValue.replace(match, fieldValue);
                        });
                    }
                    
                    transformed[unified.name] = formattedValue;
                }
            });
            
            return transformed;
        });

        this.transformedData = transformedData;
        return transformedData;
    }

    getAvailableFields() {
        // Get fields only from the final sequence result
        const lastExecutedItem = [...this.apiSequence].reverse().find(item => 
            item.executed && item.result && item.result.data
        );

        if (!lastExecutedItem) {
            return [];
        }

        let sampleData = lastExecutedItem.result.data;
        if (Array.isArray(sampleData) && sampleData.length > 0) {
            sampleData = sampleData[0];
        }
        
        const flattenedFields = this.flattenObject(sampleData);
        return Object.keys(flattenedFields).sort();
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Initializing application...');
    
    // Initialize Ignite UI components
    if (typeof defineCustomElements === 'function') {
        console.log('✅ Ignite UI defineCustomElements found, initializing...');
        defineCustomElements();
    } else {
        console.warn('⚠️ Ignite UI defineCustomElements not found. Grid will use fallback table.');
    }
    
    // Check if grid component is available
    setTimeout(() => {
        const grid = document.getElementById('sequenceResultsGrid');
        if (grid) {
            console.log('✅ Grid element found:', grid);
            console.log('Grid properties:', {
                data: typeof grid.data,
                columns: typeof grid.columns,
                autoGenerate: grid.autoGenerate
            });
        } else {
            console.error('❌ Grid element not found');
        }
    }, 1000);
    
    window.explorer = new AsanaAPIExplorer();
    
    // Add keyboard and click outside handlers for grid dialog
    setupGridDialogHandlers();
});

function setupGridDialogHandlers() {
    const gridDialog = document.getElementById('gridDialog');
    
    // Close dialog on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && gridDialog.style.display === 'flex') {
            window.explorer.closeGridDialog();
        }
    });
    
    // Close dialog on click outside modal content
    gridDialog.addEventListener('click', (e) => {
        if (e.target === gridDialog) {
            window.explorer.closeGridDialog();
        }
    });
}