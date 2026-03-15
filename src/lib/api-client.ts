// API Client using Supabase

import { supabase } from './supabase';
import { logger } from './logger';

class ApiClient {
  constructor() {
    logger.info('API Client initialized with Supabase');
  }

  // Projects
  async getProjects(currentUserDisplayName: string, isAdmin = false) {
    // Fetch all projects with member count
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*, project_members(count)')
      .order('created_at', { ascending: false });

    if (projectsError) {
      logger.error('Failed to get projects', new Error(projectsError.message));
      throw new Error(projectsError.message);
    }

    // Fetch all memberships for the current user across all projects
    const { data: membershipsData } = await supabase
      .from('project_members')
      .select('project_id, role')
      .eq('display_name', currentUserDisplayName);

    const membershipMap = new Map<string, 'owner' | 'editor' | 'viewer'>();
    (membershipsData || []).forEach((m: { project_id: string; role: string }) => {
      membershipMap.set(m.project_id, m.role as 'owner' | 'editor' | 'viewer');
    });

    const projects = (projectsData || []).map((p: Record<string, unknown>) => {
      const membersArr = p.project_members as Array<{ count: number }> | null;
      const isCreator = (p.owner_name as string | null) === currentUserDisplayName;
      const memberRole = membershipMap.get(p.id as string);

      let userRole: 'owner' | 'co-owner' | 'editor' | 'viewer';
      if (isCreator) {
        userRole = 'owner';
      } else if (p.owner_name === null) {
        // Legacy project created before ownership tracking — treat as owner
        userRole = 'owner';
      } else if (memberRole === 'owner') {
        userRole = 'co-owner';
      } else if (memberRole === 'editor') {
        userRole = 'editor';
      } else if (memberRole === 'viewer') {
        userRole = 'viewer';
      } else if (p.is_public) {
        userRole = 'viewer';
      } else if (isAdmin) {
        userRole = 'owner'; // admin has full control over all projects
      } else {
        return null; // not accessible
      }

      return {
        ...p,
        project_members: undefined,
        member_count: membersArr?.[0]?.count ?? 0,
        userRole,
      };
    }).filter(Boolean);

    logger.debug('GET projects', { count: projects.length });
    return projects;
  }

  async uploadProjectIcon(file: File, projectId: string): Promise<string> {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${projectId}.${ext}`;

    const { error } = await supabase.storage
      .from('project-icons')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      logger.error('Failed to upload project icon', new Error(error.message), { projectId });
      throw new Error(error.message);
    }

    const { data: urlData } = supabase.storage
      .from('project-icons')
      .getPublicUrl(path);

    logger.info('Uploaded project icon', { projectId, path });
    return urlData.publicUrl;
  }

  async createProject(name: string, description?: string, is_public?: boolean, ownerName?: string, iconUrl?: string | null) {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name,
        description: description || '',
        is_public: is_public ?? false,
        owner_name: ownerName ?? null,
        icon_url: iconUrl ?? null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create project', new Error(error.message), { name });
      throw new Error(error.message);
    }
    logger.info('Created project', { name, id: data.id });
    return data;
  }

  async getProject(projectId: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      logger.error('Failed to get project', new Error(error.message), { projectId });
      throw new Error(error.message);
    }
    logger.debug(`GET project ${projectId}`);
    return data;
  }

  async updateProject(projectId: string, updates: { name?: string; description?: string; is_public?: boolean; icon_url?: string | null }) {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update project', new Error(error.message), { projectId });
      throw new Error(error.message);
    }
    logger.info('Updated project', { projectId });
    return data;
  }

  async deleteProject(projectId: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      logger.error('Failed to delete project', new Error(error.message), { projectId });
      throw new Error(error.message);
    }
    logger.info('Deleted project', { projectId });
    return {};
  }

  // Project Members
  async getProjectMembers(projectId: string) {
    const { data, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to get project members', new Error(error.message), { projectId });
      throw new Error(error.message);
    }
    logger.debug('GET project members', { projectId, count: data?.length });
    return data;
  }

  async addProjectMember(projectId: string, displayName: string, role: 'owner' | 'editor' | 'viewer') {
    const { data, error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, display_name: displayName, role })
      .select()
      .single();

    if (error) {
      logger.error('Failed to add project member', new Error(error.message), { projectId, displayName });
      throw new Error(error.message);
    }
    logger.info('Added project member', { projectId, displayName, role });
    return data;
  }

  async updateMemberRole(memberId: string, role: 'owner' | 'editor' | 'viewer') {
    const { data, error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update member role', new Error(error.message), { memberId });
      throw new Error(error.message);
    }
    logger.info('Updated member role', { memberId, role });
    return data;
  }

  async removeProjectMember(memberId: string) {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      logger.error('Failed to remove project member', new Error(error.message), { memberId });
      throw new Error(error.message);
    }
    logger.info('Removed project member', { memberId });
    return {};
  }

  // ── Private helper: batch-insert rows into dataset_rows ─────────────────────
  private async insertRowsBatched(datasetId: string, rows: Record<string, string>[]) {
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((data, j) => ({
        dataset_id: datasetId,
        row_index: i + j,
        data,
      }));
      const { error } = await supabase.from('dataset_rows').insert(batch);
      if (error) throw new Error(error.message);
    }
  }

  // Datasets
  async getProjectDatasets(projectId: string) {
    const { data, error } = await supabase
      .from('datasets')
      // Exclude file_data — it can be huge and is not needed for the project list
      .select('id, project_id, name, description, row_count, column_count, storage_mode, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get project datasets', new Error(error.message), { projectId });
      throw new Error(error.message);
    }
    logger.debug('GET project datasets', { projectId, count: data?.length });
    return data;
  }

  async uploadDataset(projectId: string, file: File, customName?: string, description?: string) {
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = this.parseCSVLine(lines[0]);
    const rows = lines.slice(1)
      .filter(line => line.trim().length > 0)
      .map(line => {
        const values = this.parseCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

    const { data, error } = await supabase
      .from('datasets')
      .insert({
        project_id: projectId,
        name: customName?.trim() || file.name.replace(/\.csv$/i, ''),
        description: description?.trim() || null,
        row_count: rows.length,
        column_count: headers.length,
        storage_mode: 'rows',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to upload dataset', new Error(error.message), { fileName: file.name, projectId });
      throw new Error(error.message);
    }

    await this.insertRowsBatched(data.id, rows);

    logger.info('Dataset uploaded', { fileName: file.name, projectId, datasetId: data.id });
    return data;
  }

  async createDatasetFromRows(
    projectId: string,
    name: string,
    headers: string[],
    rows: Record<string, string>[]
  ) {
    const { data, error } = await supabase
      .from('datasets')
      .insert({
        project_id: projectId,
        name: name.trim(),
        row_count: rows.length,
        column_count: headers.length,
        storage_mode: 'rows',
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create dataset from rows', new Error(error.message), { projectId, name });
      throw new Error(error.message);
    }

    await this.insertRowsBatched(data.id, rows);

    logger.info('Dataset created from rows', { projectId, name, datasetId: data.id });
    return data;
  }

  async getDataset(datasetId: string) {
    const { data, error } = await supabase
      .from('datasets')
      .select('*')
      .eq('id', datasetId)
      .single();

    if (error) {
      logger.error('Failed to get dataset', new Error(error.message), { datasetId });
      throw new Error(error.message);
    }
    return data;
  }

  async renameDataset(datasetId: string, name: string, description?: string | null) {
    const updates: Record<string, unknown> = { name };
    if (description !== undefined) updates.description = description;
    const { data, error } = await supabase
      .from('datasets')
      .update(updates)
      .eq('id', datasetId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update dataset', new Error(error.message), { datasetId });
      throw new Error(error.message);
    }
    logger.info('Updated dataset', { datasetId, name });
    return data;
  }

  async deleteDataset(datasetId: string) {
    const { error } = await supabase
      .from('datasets')
      .delete()
      .eq('id', datasetId);

    if (error) {
      logger.error('Failed to delete dataset', new Error(error.message), { datasetId });
      throw new Error(error.message);
    }
    logger.info('Deleted dataset', { datasetId });
    return {};
  }

  async previewDataset(datasetId: string, limit: number = 100, offset: number = 0) {
    // Check storage mode first
    const { data: ds, error: dsError } = await supabase
      .from('datasets')
      .select('storage_mode, file_data')
      .eq('id', datasetId)
      .single();

    if (dsError) {
      logger.error('Failed to preview dataset', new Error(dsError.message), { datasetId });
      throw new Error(dsError.message);
    }

    if (ds.storage_mode === 'rows') {
      // Supabase PostgREST caps a single request at 1000 rows.
      // Loop in pages of 1000 until we have all requested rows.
      const PAGE = 1000;
      const allRows: Record<string, string>[] = [];
      let cursor = offset;
      const target = offset + limit;

      while (cursor < target) {
        const pageEnd = Math.min(cursor + PAGE, target) - 1;
        const { data, error } = await supabase
          .from('dataset_rows')
          .select('data')
          .eq('dataset_id', datasetId)
          .order('row_index', { ascending: true })
          .range(cursor, pageEnd);

        if (error) {
          logger.error('Failed to preview dataset rows', new Error(error.message), { datasetId });
          throw new Error(error.message);
        }

        const page = (data ?? []).map(r => r.data as Record<string, string>);
        allRows.push(...page);

        // If Supabase returned fewer rows than requested, we've hit the end of the table
        if (page.length < pageEnd - cursor + 1) break;
        cursor += PAGE;
      }

      return allRows;
    }

    // Fallback: legacy jsonb datasets
    const rows = (ds.file_data as Record<string, string>[]) || [];
    return rows.slice(offset, offset + limit);
  }

  // Quality Dimensions
  async getQualityDimensions() {
    const { data, error } = await supabase
      .from('quality_dimension_config')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      logger.error('Failed to get quality dimensions', new Error(error.message));
      throw new Error(error.message);
    }
    return data;
  }

  async createQualityDimension(dimensionData: {
    name: string;
    key: string;
    description?: string;
    icon?: string;
    is_active?: boolean;
  }) {
    const { data, error } = await supabase
      .from('quality_dimension_config')
      .insert({
        name: dimensionData.name,
        key: dimensionData.key,
        description: dimensionData.description || '',
        icon: dimensionData.icon || 'check-circle',
        color: '#14b8a6',
        is_active: dimensionData.is_active ?? true,
        display_order: 0,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create quality dimension', new Error(error.message), { key: dimensionData.key });
      throw new Error(error.message);
    }
    logger.info('Created quality dimension', { key: dimensionData.key });
    return data;
  }

  async updateQualityDimension(dimensionId: string, updates: {
    name?: string;
    description?: string;
    icon?: string;
    is_active?: boolean;
  }) {
    const { data, error } = await supabase
      .from('quality_dimension_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', dimensionId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update quality dimension', new Error(error.message), { dimensionId });
      throw new Error(error.message);
    }
    logger.info('Updated quality dimension', { dimensionId });
    return data;
  }

  async deleteQualityDimension(dimensionId: string) {
    const { error } = await supabase
      .from('quality_dimension_config')
      .delete()
      .eq('id', dimensionId);

    if (error) {
      logger.error('Failed to delete quality dimension', new Error(error.message), { dimensionId });
      throw new Error(error.message);
    }
    logger.info('Deleted quality dimension', { dimensionId });
    return {};
  }

  // Templates
  async getTemplates(datasetId?: string) {
    let query = supabase
      .from('quality_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (datasetId) {
      query = query.eq('dataset_id', datasetId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get templates', new Error(error.message));
      throw new Error(error.message);
    }
    return data;
  }

  async saveTemplate(name: string, templateData: Record<string, unknown>, datasetId?: string) {
    const { data, error } = await supabase
      .from('quality_templates')
      .insert({
        name,
        template_data: templateData,
        ...(datasetId ? { dataset_id: datasetId } : {}),
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to save template', new Error(error.message), { name });
      throw new Error(error.message);
    }
    logger.info('Saved template', { name, id: data.id });
    return data;
  }

  async updateTemplate(templateId: string, templateData: Record<string, unknown>) {
    const { error } = await supabase
      .from('quality_templates')
      .update({ template_data: templateData })
      .eq('id', templateId);

    if (error) {
      logger.error('Failed to update template', new Error(error.message), { templateId });
      throw new Error(error.message);
    }
    logger.info('Updated template', { templateId });
  }

  async deleteTemplate(templateId: string) {
    const { error } = await supabase
      .from('quality_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      logger.error('Failed to delete template', new Error(error.message), { templateId });
      throw new Error(error.message);
    }
    logger.info('Deleted template', { templateId });
    return {};
  }

  // Quality Results
  async saveQualityResults(datasetId: string, results: Array<{
    column_name: string;
    dimension: string;
    passed_count: number;
    failed_count: number;
    total_count: number;
    score: number;
  }>) {
    // Delete previous results for this dataset first
    const { error: deleteError } = await supabase
      .from('quality_results')
      .delete()
      .eq('dataset_id', datasetId);

    if (deleteError) {
      logger.warn('Failed to clear old results', { error: deleteError.message });
    }

    const rows = results.map(r => ({
      dataset_id: datasetId,
      column_name: r.column_name,
      dimension: r.dimension,
      passed_count: r.passed_count,
      failed_count: r.failed_count,
      total_count: r.total_count,
      score: r.score,
      executed_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('quality_results')
      .insert(rows)
      .select();

    if (error) {
      logger.error('Failed to save quality results', new Error(error.message), { datasetId });
      throw new Error(error.message);
    }
    logger.info('Saved quality results', { datasetId, count: data.length });
    return data;
  }

  async getQualityResults(datasetId: string) {
    const { data, error } = await supabase
      .from('quality_results')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('executed_at', { ascending: false });

    if (error) {
      logger.error('Failed to get quality results', new Error(error.message), { datasetId });
      throw new Error(error.message);
    }
    return data;
  }

  /** Keep only specified columns in a dataset, updates column_count */
  async trimDatasetColumns(datasetId: string, keepColumns: string[]) {
    const { data: ds, error: fetchError } = await supabase
      .from('datasets')
      .select('storage_mode, file_data, row_count')
      .eq('id', datasetId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    if (ds.storage_mode === 'rows') {
      const PAGE = 1000;
      const keepSet = new Set(keepColumns);
      let offset = 0;

      while (true) {
        const { data: pageData, error: pageError } = await supabase
          .from('dataset_rows')
          .select('id, row_index, data')
          .eq('dataset_id', datasetId)
          .order('row_index', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (pageError) throw new Error(pageError.message);
        if (!pageData || pageData.length === 0) break;

        const upsertPayload = pageData.map(r => {
          const trimmed: Record<string, string> = {};
          for (const col of keepSet) {
            if (col in (r.data as object)) trimmed[col] = (r.data as Record<string, string>)[col];
          }
          return { id: r.id, dataset_id: datasetId, row_index: r.row_index, data: trimmed };
        });

        const { error: upsertError } = await supabase
          .from('dataset_rows')
          .upsert(upsertPayload, { onConflict: 'id' });
        if (upsertError) throw new Error(upsertError.message);

        if (pageData.length < PAGE) break;
        offset += PAGE;
      }

      const { error: updateError } = await supabase
        .from('datasets')
        .update({ column_count: keepColumns.length })
        .eq('id', datasetId);
      if (updateError) throw new Error(updateError.message);
    } else {
      // Legacy jsonb path
      const rows = (ds.file_data as Record<string, string>[]) || [];
      const trimmed = rows.map(row => {
        const out: Record<string, string> = {};
        keepColumns.forEach(col => { if (col in row) out[col] = row[col]; });
        return out;
      });
      const { error: updateError } = await supabase
        .from('datasets')
        .update({ file_data: trimmed, column_count: keepColumns.length })
        .eq('id', datasetId);
      if (updateError) throw new Error(updateError.message);
    }
  }

  // Quality Result Scores
  async saveQualityScore(
    datasetId: string,
    label: string,
    publishedBy: string,
    overallScore: number,
    results: Array<Record<string, unknown>>,
  ) {
    // Strip rowDetails from the summary stored in quality_result_scores
    const summaryResults = results.map(r => ({
      id:           r.id,
      column_name:  r.column_name,
      dimension:    r.dimension,
      passed_count: r.passed_count,
      failed_count: r.failed_count,
      total_count:  r.total_count,
      score:        r.score,
      executed_at:  r.executed_at,
    }));

    const { data, error } = await supabase
      .from('quality_result_scores')
      .insert({
        dataset_id:    datasetId,
        label,
        published_by:  publishedBy,
        overall_score: overallScore,
        results:       summaryResults,
        published_at:  new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const scoreId = data.id as string;

    // Insert per-row details into result_score_rows in batches of 500
    const BATCH = 500;
    for (const r of results) {
      const rowDetails = (r.rowDetails as Array<{ rowIndex: number; value: unknown; passed: boolean; reason?: string }>) ?? [];
      if (rowDetails.length === 0) continue;
      const resultKey = `${r.column_name}:${r.dimension}`;
      for (let i = 0; i < rowDetails.length; i += BATCH) {
        const batch = rowDetails.slice(i, i + BATCH).map(d => ({
          score_id:   scoreId,
          result_key: resultKey,
          row_index:  d.rowIndex,
          value:      d.value !== null && d.value !== undefined ? String(d.value) : null,
          passed:     d.passed,
          reason:     d.reason ?? null,
        }));
        const { error: rowErr } = await supabase.from('result_score_rows').insert(batch);
        if (rowErr) throw new Error(rowErr.message);
      }
    }

    return data;
  }

  async getQualityScores(datasetId: string) {
    const { data, error } = await supabase
      .from('quality_result_scores')
      .select('id, dataset_id, label, published_by, overall_score, published_at, results')
      .eq('dataset_id', datasetId)
      .order('published_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  async getQualityScore(scoreId: string) {
    // Fetch the result score summary (no rowDetails in this column anymore)
    const { data, error } = await supabase
      .from('quality_result_scores')
      .select('id, dataset_id, label, published_by, overall_score, results, published_at')
      .eq('id', scoreId)
      .single();
    if (error) throw new Error(error.message);

    // Fetch per-row details from the separate table
    const { data: rowData, error: rowError } = await supabase
      .from('result_score_rows')
      .select('result_key, row_index, value, passed, reason')
      .eq('score_id', scoreId)
      .order('result_key', { ascending: true })
      .order('row_index', { ascending: true });
    if (rowError) throw new Error(rowError.message);

    // Group row details back onto each result entry
    const detailsByKey: Record<string, Array<{ rowIndex: number; value: unknown; passed: boolean; reason?: string }>> = {};
    for (const row of rowData ?? []) {
      if (!detailsByKey[row.result_key]) detailsByKey[row.result_key] = [];
      detailsByKey[row.result_key].push({
        rowIndex: row.row_index,
        value:    row.value,
        passed:   row.passed,
        reason:   row.reason ?? undefined,
      });
    }

    const resultsWithDetails = ((data.results as Array<Record<string, unknown>>) ?? []).map(r => ({
      ...r,
      rowDetails: detailsByKey[`${r.column_name}:${r.dimension}`] ?? [],
    }));

    return { ...data, results: resultsWithDetails };
  }

  async deleteQualityScore(scoreId: string) {
    // result_score_rows are deleted automatically via ON DELETE CASCADE
    const { error } = await supabase
      .from('quality_result_scores')
      .delete()
      .eq('id', scoreId);
    if (error) throw new Error(error.message);
  }

  // App Users
  async loginOrCreateUser(displayName: string) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('app_users')
      .upsert(
        { display_name: displayName, last_seen_at: now },
        { onConflict: 'display_name' }
      )
      .select()
      .single();

    if (error) {
      logger.error('Failed to login/create user', new Error(error.message), { displayName });
      throw new Error(error.message);
    }
    logger.info('User logged in', { displayName, id: data.id });
    return data;
  }

  async createUser(displayName: string) {
    const { data, error } = await supabase
      .from('app_users')
      .insert({ display_name: displayName })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create user', new Error(error.message), { displayName });
      throw new Error(error.message);
    }
    logger.info('Created user', { displayName, id: data.id });
    return data;
  }

  async getAllUsers() {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to get all users', new Error(error.message));
      throw new Error(error.message);
    }
    return data;
  }

  async updateUserRole(userId: string, role: 'admin' | 'user') {
    const { data, error } = await supabase
      .from('app_users')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update user role', new Error(error.message), { userId });
      throw new Error(error.message);
    }
    logger.info('Updated user role', { userId, role });
    return data;
  }

  async deleteUser(userId: string) {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (error) {
      logger.error('Failed to delete user', new Error(error.message), { userId });
      throw new Error(error.message);
    }
    logger.info('Deleted user', { userId });
    return {};
  }

  async getUserMemberships(displayName: string) {
    const { data, error } = await supabase
      .from('project_members')
      .select('role, project_id, projects(id, name)')
      .eq('display_name', displayName);

    if (error) {
      logger.error('Failed to get user memberships', new Error(error.message), { displayName });
      throw new Error(error.message);
    }
    return (data || []) as unknown as Array<{
      role: 'owner' | 'editor' | 'viewer';
      project_id: string;
      projects: { id: string; name: string } | null;
    }>;
  }

  // Helper: parse CSV line handling quoted values
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ── Framework nodes (System Overview mind map) ──────────────────────────────

  async getFrameworkNodes() {
    const { data, error } = await supabase
      .from('framework_nodes')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async addFrameworkNode(payload: { parent_id: string | null; label: string; description: string; sort_order: number; status?: string }) {
    const { data, error } = await supabase
      .from('framework_nodes')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async updateFrameworkNode(id: string, payload: { label?: string; description?: string; status?: string }) {
    const { data, error } = await supabase
      .from('framework_nodes')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteFrameworkNode(id: string) {
    const { error } = await supabase
      .from('framework_nodes')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
