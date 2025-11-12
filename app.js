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
            const response = await fetch('https://raw.githubusercontent.com/pmoleri/openapi/refs/heads/patch-1/defs/asana_oas.yaml');
            const yamlText = await response.text();
            
            // Parse YAML to extract endpoints
            this.parseYAMLSpec(yamlText);
        } catch (error) {
            // Fallback: create sample endpoints from the fetched content
            this.createSampleEndpoints();
        }
    }

    parseYAMLSpec(yamlText) {
        // Simple YAML parser for paths section
        const lines = yamlText.split('\n');
        let inPaths = false;
        let currentPath = '';
        let currentMethod = '';
        let currentEndpoint = null;
        let indent = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed === 'paths:') {
                inPaths = true;
                continue;
            }
            
            if (!inPaths) continue;
            
            // Stop if we hit another top-level section
            if (line.match(/^[a-zA-Z]/)) {
                inPaths = false;
                continue;
            }
            
            const lineIndent = line.length - line.trimLeft().length;
            
            // Path definition (starts with /)
            if (trimmed.startsWith('/') && trimmed.endsWith(':')) {
                currentPath = trimmed.slice(0, -1);
                continue;
            }
            
            // HTTP method
            if (['get:', 'post:', 'put:', 'patch:', 'delete:', 'head:', 'options:'].includes(trimmed)) {
                currentMethod = trimmed.slice(0, -1).toUpperCase();
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
            
            // Extract endpoint details
            if (currentEndpoint && lineIndent > 4) {
                if (trimmed.startsWith('summary:')) {
                    currentEndpoint.summary = trimmed.replace('summary:', '').trim();
                } else if (trimmed.startsWith('description:')) {
                    let desc = trimmed.replace('description:', '').trim();
                    // Handle multi-line descriptions
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim() && !lines[j].trim().includes(':')) {
                        desc += ' ' + lines[j].trim();
                        j++;
                    }
                    currentEndpoint.description = desc;
                } else if (trimmed.startsWith('operationId:')) {
                    currentEndpoint.operationId = trimmed.replace('operationId:', '').trim();
                } else if (trimmed.startsWith('tags:')) {
                    // Handle tags array
                    let j = i + 1;
                    while (j < lines.length && lines[j].trim().startsWith('- ')) {
                        currentEndpoint.tags.push(lines[j].trim().substring(2));
                        j++;
                    }
                }
            }
            
            // Save completed endpoint
            if (currentEndpoint && (trimmed.startsWith('/') || ['get:', 'post:', 'put:', 'patch:', 'delete:'].includes(trimmed) || !inPaths)) {
                if (currentEndpoint.path && currentEndpoint.method) {
                    this.endpoints.push({ ...currentEndpoint });
                }
                currentEndpoint = null;
            }
        }
        
        // Add the last endpoint if exists
        if (currentEndpoint && currentEndpoint.path && currentEndpoint.method) {
            this.endpoints.push(currentEndpoint);
        }
        
        // If parsing didn't work well, fall back to sample data
        if (this.endpoints.length < 10) {
            this.createSampleEndpoints();
        }
    }

    createSampleEndpoints() {
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
            }
        ];
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
                    ${endpoint.tags.length > 0 ? `
                        <div class="endpoint-tags">
                            ${endpoint.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                    ${endpoint.operationId ? `
                        <div style="font-size: 12px; color: #6c757d; margin-bottom: 0.5rem;">
                            <strong>Operation ID:</strong> ${endpoint.operationId}
                        </div>
                    ` : ''}
                    ${endpoint.security.length > 0 ? `
                        <div class="security-info">
                            <strong>Security:</strong> ${endpoint.security.join(', ')}
                        </div>
                    ` : ''}
                    ${this.canExecuteEndpoint(endpoint) ? `
                        <button class="execute-btn" onclick="explorer.executeEndpoint(${index})" 
                                ${!this.personalAccessToken ? 'disabled' : ''}>
                            ${this.personalAccessToken ? 'Execute API Call' : 'Enter PAT to Execute'}
                        </button>
                        <div id="response-${index}"></div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        container.innerHTML = `<div class="endpoints-grid">${endpointsHTML}</div>`;
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
            '/teams'
        ];
        
        return endpoint.method === 'GET' && 
               (safeEndpoints.includes(endpoint.path) || 
                endpoint.path.match(/^\/(users|workspaces|teams)$/));
    }

    async executeEndpoint(endpointIndex) {
        const endpoint = this.filteredEndpoints[endpointIndex];
        const responseContainer = document.getElementById(`response-${endpointIndex}`);
        
        if (!this.personalAccessToken) {
            this.showApiResponse(responseContainer, 'Please enter and test your PAT first', 'error');
            return;
        }

        // Show loading state
        this.showApiResponse(responseContainer, 'Executing API call...', 'loading');

        try {
            // Construct the full URL
            let apiUrl = `${this.baseUrl}${endpoint.path}`;
            
            // Add some basic query parameters for GET requests
            if (endpoint.method === 'GET') {
                const params = new URLSearchParams();
                params.append('limit', '10'); // Limit results for demo
                params.append('opt_pretty', 'true');
                apiUrl += `?${params.toString()}`;
            }

            const response = await fetch(apiUrl, {
                method: endpoint.method,
                headers: {
                    'Authorization': `Bearer ${this.personalAccessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            const responseData = await response.json();
            
            if (response.ok) {
                this.showApiResponse(responseContainer, 
                    `Status: ${response.status} ${response.statusText}\n\n${JSON.stringify(responseData, null, 2)}`, 
                    'success');
            } else {
                this.showApiResponse(responseContainer, 
                    `Error ${response.status}: ${responseData.errors?.[0]?.message || 'API call failed'}\n\n${JSON.stringify(responseData, null, 2)}`, 
                    'error');
            }
        } catch (error) {
            this.showApiResponse(responseContainer, `Network Error: ${error.message}`, 'error');
        }
    }

    showApiResponse(container, content, type) {
        container.innerHTML = `
            <div class="api-response ${type}">
                <div class="response-header">${type === 'loading' ? '⏳ Loading...' : type === 'success' ? '✅ Response:' : '❌ Error:'}</div>
                ${content}
            </div>
        `;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.explorer = new AsanaAPIExplorer();
});