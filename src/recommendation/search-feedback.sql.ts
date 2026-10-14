/** Evaluate the caller's private feedback once, not once per candidate activity. */
export const SEARCH_FEEDBACK_SQL = `
  SELECT f.id AS feedback_id, fp.id AS plan_id, f.rating, f.tags,
         f.actual_cost, fp.estimated_total_cost
  FROM feedback f
  JOIN feedback_status fs ON fs.id = f.id_feedback_status AND fs.key IN ('pending','processed')
  JOIN plan fp ON fp.id = f.id_plan AND fp.id_user = :searchUser AND fp.deleted_at IS NULL
  JOIN plan_status fps ON fps.id = fp.id_plan_status AND fps.key = 'completed'
  WHERE f.deleted_at IS NULL
`;

export const SEARCH_AFFINITY_SQL = `
  SELECT id_category, AVG((rating - 3)::float) * COUNT(*) / (COUNT(*) + 3) AS affinity
  FROM (
    SELECT DISTINCT f.feedback_id, f.rating, ac.id_category
    FROM search_feedback f
    JOIN plan_detail pd ON pd.id_plan = f.plan_id AND pd.deleted_at IS NULL
    JOIN activity_category ac ON ac.id_activity = pd.id_activity AND ac.deleted_at IS NULL
    JOIN category c ON c.id = ac.id_category AND c.deleted_at IS NULL
    JOIN category_status cs ON cs.id = c.id_category_status AND cs.key = 'active' AND cs.deleted_at IS NULL
  ) pairs GROUP BY id_category
`;

export const SEARCH_SENSITIVITY_SQL = `
  SELECT COALESCE(AVG(CASE WHEN 'far' = ANY(tags) THEN 1.0 ELSE 0 END), 0) AS distance_sensitivity,
         LEAST(1, COALESCE(AVG(CASE WHEN 'too_expensive' = ANY(tags) THEN 1.0 ELSE 0 END),0)
           + COALESCE(AVG(GREATEST(actual_cost / NULLIF(estimated_total_cost,0) - 1, 0)),0)) AS cost_sensitivity
  FROM search_feedback
`;
