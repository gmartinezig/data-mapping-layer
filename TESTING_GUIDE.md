# Testing Asana API Explorer Features

## Iteration Feature Testing

### Overview
The application now supports **iteration functionality** where a step can iterate over array data from a previous step and execute multiple API calls, then unify the results.

### Test Steps:

### 1. Import Iteration Test Sequence
- Open the Asana API Explorer
- Click "Import Sequence" 
- Select the `test-import.json` file
- **Expected Result**: 
  - 2-step sequence should load: "Get projects" → "Get tasks for each project"
  - Step 2 should show iteration configuration with checkbox enabled
  - Transformation panel should appear with field mappings for task data

### 2. Review Iteration Configuration
- Look at Step 2 (Get tasks)
- **Expected Result**:
  - 🔄 Enable Iteration checkbox should be checked
  - Source field should show "step0.data (Previous configuration)"
  - Iteration variable should be "item"
  - "Unify results into array" should be checked
  - Usage hint should explain how to use `{{item.fieldName}}`

### 3. Execute Sequence with Iteration
- Set your Personal Access Token (required)
- Click "Execute All" to run the sequence
- **Expected Result**:
  - Step 1 executes normally and gets projects
  - Step 2 shows iteration progress (e.g., "Iteration 1/5", "Iteration 2/5", etc.)
  - Step 2 result should show unified array of all tasks from all projects
  - Results should include iteration summary (total iterations, successful, failed, unified items)

### 4. Verify Iteration Results
- Check Step 2 results
- **Expected Results**:
  - Data array should contain tasks from multiple projects unified into one array
  - Iteration summary should show stats like "5 total iterations, 5 successful, 0 failed, 50 unified items"
  - Field mapping dropdowns should auto-populate with task fields after execution

### 5. Test Manual Iteration Configuration
- Add a new endpoint to the sequence
- Enable iteration on the new step
- Configure it to iterate over the task data from Step 2
- **Expected Result**: 
  - Should be able to select task data as iteration source
  - Should be able to configure iteration variable name
  - Should be able to toggle result unification

## Field Mapping Auto-Population Testing

### 1. Import Test Sequence
- The imported sequence includes pre-configured field mappings
- **Expected Result**: 
  - Transformation panel should appear automatically
  - Field mappings should be visible with imported source fields marked as "(imported)"
  - Warning message should appear: "Execute the sequence to populate field options in the dropdowns"

### 2. Execute Sequence  
- Set your Personal Access Token (required)
- Click "Execute All" to run the sequence
- **Expected Result**:
  - After execution completes, field mapping dropdowns should auto-populate with available fields
  - Header should briefly change to "Field Options Updated" in green
  - Previously imported field mappings should now show in the dropdowns with proper selection

### 3. Verify Field Options
- Check that the field mapping dropdowns now contain actual API result fields
- Previously imported mappings should still be selected if they exist in the API results
- Any non-matching imported fields should still be visible but marked as "(imported)"

### 4. Test Clear Functionality
- Click "Clear All"
- **Expected Result**: Transformation panel should hide automatically

## Key Features:
1. **🔄 Iteration functionality** for looping over array data from previous steps
2. **Auto-refresh field options** after sequence execution
3. **Preserve imported configurations** for iteration and field mappings
4. **Visual indicators** for imported vs live data  
5. **Unified result aggregation** from multiple iterations
6. **Export/Import support** for iteration configurations

## Example Use Cases:
- Get all projects → For each project, get its tasks → Unify all tasks
- Get all workspaces → For each workspace, get its users → Aggregate all users
- Get all teams → For each team, get its projects → Combine project lists