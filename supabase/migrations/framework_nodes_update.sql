-- ============================================================
-- Framework Nodes Update
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Fix root node name
UPDATE framework_nodes
SET label = 'Quality Plus',
    description = 'End-to-end data quality management platform for AEM Energy Solutions'
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2. AI Recommendations — change from planned → existing, update description
UPDATE framework_nodes
SET status = 'existing',
    label = 'AI Recommendations',
    description = 'AI-driven validity rule suggestions and consistency column detection using domain knowledge'
WHERE id = '00000000-0000-0000-0000-0000000000e0';

-- 3. Update children of AI Recommendations to reflect what is actually built
-- Remove old planned sub-features that are no longer accurate
DELETE FROM framework_nodes
WHERE parent_id = '00000000-0000-0000-0000-0000000000e0';

-- Insert actual existing sub-features under AI Recommendations
INSERT INTO framework_nodes (parent_id, label, description, sort_order, status) VALUES
('00000000-0000-0000-0000-0000000000e0',
 'AI Quality Check Recommendations',
 'Analyses all dataset columns with domain knowledge and Ollama to recommend validity rules and flag consistency columns',
 1, 'existing'),
('00000000-0000-0000-0000-0000000000e0',
 'O&G Domain Knowledge Base',
 'Supabase tables ai_validity_rules and ai_domain_knowledge store patterns for oil & gas columns — editable without code changes',
 2, 'existing'),
('00000000-0000-0000-0000-0000000000e0',
 'Auto-Apply Rules',
 'Recommended validity rules are automatically applied to configuration; consistency columns are added to the Consistency dimension',
 3, 'existing'),
('00000000-0000-0000-0000-0000000000e0',
 'Threshold Optimisation',
 'Suggest optimal pass/fail thresholds based on historical score distributions',
 4, 'planned');

-- 4. Add AI Summary as a new top-level capability (existing)
INSERT INTO framework_nodes (parent_id, label, description, sort_order, status) VALUES
('00000000-0000-0000-0000-000000000001',
 'AI Summary',
 'Automatically generates a natural-language quality summary after each result score is saved',
 10, 'existing');

-- Get the new AI Summary node id for children
DO $$
DECLARE ai_summary_id uuid;
BEGIN
  SELECT id INTO ai_summary_id
  FROM framework_nodes
  WHERE label = 'AI Summary' AND parent_id = '00000000-0000-0000-0000-000000000001'
  ORDER BY created_at DESC LIMIT 1;

  INSERT INTO framework_nodes (parent_id, label, description, sort_order, status) VALUES
  (ai_summary_id, 'n8n + Ollama Integration',
   'Triggers n8n webhook on score save; Ollama (Mistral) generates summary; result written back to Supabase',
   1, 'existing'),
  (ai_summary_id, 'Skeleton Loading',
   'Animated skeleton panel shown while Ollama generates — matches final content layout',
   2, 'existing'),
  (ai_summary_id, 'Key Issues with View Rows',
   'Each failed check listed with column, dimension, fail count, and a button to open the failed rows modal',
   3, 'existing'),
  (ai_summary_id, 'All Failed Rows Combined View',
   'Single modal showing all failed rows across all checks with search, per-column filter, rows-per-page selector, and CSV export',
   4, 'existing'),
  (ai_summary_id, 'Draft Auto-Save',
   'Draft score created immediately on execute so AI summary triggers before user explicitly saves',
   5, 'existing');
END $$;

-- 5. Update Quality Scoring node to reflect template system and new features
UPDATE framework_nodes
SET description = 'Run configurable dimension-based quality checks on any dataset with template support and AI recommendations'
WHERE id = '00000000-0000-0000-0000-000000000040';

-- Add Template System as sub-feature under Quality Scoring if not already there
INSERT INTO framework_nodes (parent_id, label, description, sort_order, status)
SELECT '00000000-0000-0000-0000-000000000040',
       'Template System',
       'Save and reload quality check configurations as named templates — reuse across datasets',
       5, 'existing'
WHERE NOT EXISTS (
  SELECT 1 FROM framework_nodes
  WHERE parent_id = '00000000-0000-0000-0000-000000000040' AND label = 'Template System'
);

-- 6. Add Quality Check shortcut to Records Explorer
INSERT INTO framework_nodes (parent_id, label, description, sort_order, status)
SELECT '00000000-0000-0000-0000-000000000030',
       'Quality Check Shortcut',
       'One-click button in the Records tab navigates directly to Quality Check tab with current dataset pre-selected',
       6, 'existing'
WHERE NOT EXISTS (
  SELECT 1 FROM framework_nodes
  WHERE parent_id = '00000000-0000-0000-0000-000000000030' AND label = 'Quality Check Shortcut'
);

-- 7. Add Failed Rows View to Result Scores
INSERT INTO framework_nodes (parent_id, label, description, sort_order, status)
SELECT '00000000-0000-0000-0000-000000000050',
       'Failed Rows Modal',
       'Per-check failed row inspection showing full dataset with failed cells highlighted, search, filter, rows-per-page, and CSV export',
       5, 'existing'
WHERE NOT EXISTS (
  SELECT 1 FROM framework_nodes
  WHERE parent_id = '00000000-0000-0000-0000-000000000050' AND label = 'Failed Rows Modal'
);

-- 8. Update Quality Score Chatbot — keep planned but clarify scope
UPDATE framework_nodes
SET description = 'Planned conversational AI to explain score results and answer follow-up questions about data quality findings'
WHERE id = '00000000-0000-0000-0000-0000000000f0';

-- Remove outdated planned chatbot sub-features
DELETE FROM framework_nodes
WHERE parent_id = '00000000-0000-0000-0000-0000000000f0';

INSERT INTO framework_nodes (parent_id, label, description, sort_order, status) VALUES
('00000000-0000-0000-0000-0000000000f0',
 'Score Explanation',
 'Ask why a dataset scored low and get a plain-English breakdown per dimension',
 1, 'planned'),
('00000000-0000-0000-0000-0000000000f0',
 'Fix Suggestions',
 'Receive actionable recommendations on which rows or columns to clean first',
 2, 'planned'),
('00000000-0000-0000-0000-0000000000f0',
 'Trend Analysis Q&A',
 'Query score history in natural language — e.g. "has completeness improved this month?"',
 3, 'planned');
