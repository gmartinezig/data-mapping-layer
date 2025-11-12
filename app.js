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
        
        this.loadPATFromStorage();
        this.init();
    }

    async init() {
        try {
            await this.loadAsanaAPISpec();
            this.setupEventListeners();
            this.restorePATToInput();
            this.renderEndpoints();
            this.updateStats();
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

    buildQueryParameters(index) {
        const params = new URLSearchParams();
        
        // Common parameters
        const limitInput = document.getElementById(`query-limit-${index}`);
        if (limitInput && limitInput.value) {
            params.append('limit', limitInput.value);
        } else {
            params.append('limit', '10'); // Default limit
        }

        const offsetInput = document.getElementById(`query-offset-${index}`);
        if (offsetInput && offsetInput.value) {
            params.append('offset', offsetInput.value);
        }

        const fieldsInput = document.getElementById(`query-opt_fields-${index}`);
        if (fieldsInput && fieldsInput.value) {
            params.append('opt_fields', fieldsInput.value);
        }

        const expandInput = document.getElementById(`query-opt_expand-${index}`);
        if (expandInput && expandInput.value) {
            params.append('opt_expand', expandInput.value);
        }

        // Additional endpoint-specific parameters
        ['archived', 'team', 'assignee', 'project', 'completed_since'].forEach(paramName => {
            const input = document.getElementById(`query-${paramName}-${index}`);
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

        params.append('opt_pretty', 'true');
        return params;
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
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.explorer = new AsanaAPIExplorer();
});