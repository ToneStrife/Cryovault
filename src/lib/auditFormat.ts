type AuditValues = Record<string, any> | null | undefined;

export type AuditLogLike = {
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values?: AuditValues;
  new_values?: AuditValues;
  created_at: string;
};

export type AuditProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const ENTITY_LABEL: Record<string, string> = {
  sample: 'Muestra',
  box: 'Caja',
  freezer: 'Congelador',
  rack: 'Rack',
  profile: 'Usuario',
  settings: 'Ajustes',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'creada',
  update: 'actualizada',
  delete: 'eliminada',
  move: 'movida',
};

const FIELD_LABEL: Record<string, string> = {
  sample_code: 'codigo',
  patient_code: 'paciente',
  subject_code: 'sujeto',
  project: 'proyecto',
  sample_type: 'tipo',
  subtype: 'subtipo',
  volume: 'volumen',
  units: 'unidades',
  concentration: 'concentracion',
  status: 'estado',
  freeze_date: 'fecha congelacion',
  collection_date: 'fecha extraccion',
  max_thaws: 'max. descong.',
  thaw_count: 'descong.',
  notes: 'notas',
  name: 'nombre',
  description: 'descripcion',
  shelf_number: 'zona',
  rack_shelf_number: 'zona interna',
  position_label: 'posicion',
  box_id: 'caja',
  rack_id: 'rack',
  freezer_id: 'congelador',
  role: 'rol',
  laboratory: 'laboratorio',
  full_name: 'nombre',
  email: 'email',
};

const TRACKED_FIELDS = [
  'sample_code', 'name', 'status', 'sample_type', 'subtype', 'volume', 'units', 'concentration',
  'project', 'patient_code', 'subject_code', 'freeze_date', 'collection_date', 'max_thaws',
  'thaw_count', 'position_label', 'box_id', 'rack_id', 'shelf_number', 'rack_shelf_number',
  'description', 'role', 'laboratory', 'full_name', 'email', 'notes',
];

function shortId(id?: string | null) {
  return id ? `${String(id).slice(0, 8)}...` : 'sin id';
}

function displayValue(value: any) {
  if (value === null || value === undefined || value === '') return 'vacio';
  if (typeof value === 'string' && /^[0-9a-f-]{32,}$/i.test(value)) return shortId(value);
  return String(value);
}

function entityName(log: AuditLogLike) {
  const values = log.new_values || log.old_values || {};
  if (log.entity_type === 'sample') {
    const code = values.sample_code || shortId(log.entity_id);
    const patient = values.patient_code ? ` · ${values.patient_code}` : '';
    const project = values.project ? ` · ${values.project}` : '';
    return `${code}${patient}${project}`;
  }
  if (log.entity_type === 'profile') return values.full_name || values.email || shortId(log.entity_id);
  if (log.entity_type === 'settings') return values.laboratory || 'configuracion';
  return values.name || shortId(log.entity_id);
}

export function makeUserMap(profiles: AuditProfile[]) {
  const map: Record<string, string> = {};
  profiles.forEach((p) => {
    map[p.id] = p.full_name || p.email || shortId(p.id);
  });
  return map;
}

export function formatAuditChanges(log: AuditLogLike, max = 4) {
  if (log.action !== 'update' || !log.old_values || !log.new_values) return [];
  return TRACKED_FIELDS
    .filter((field) => JSON.stringify(log.old_values?.[field] ?? null) !== JSON.stringify(log.new_values?.[field] ?? null))
    .slice(0, max)
    .map((field) => `${FIELD_LABEL[field] || field}: ${displayValue(log.old_values?.[field])} -> ${displayValue(log.new_values?.[field])}`);
}

export function formatAuditLog(log: AuditLogLike, userMap: Record<string, string> = {}) {
  const entity = ENTITY_LABEL[log.entity_type] || log.entity_type;
  const name = entityName(log);
  const actor = userMap[log.user_id] || shortId(log.user_id);
  const action = ACTION_LABEL[log.action] || log.action;
  const changes = formatAuditChanges(log);
  return {
    entity,
    name,
    actor,
    action,
    title: `${entity} ${name} ${action}`,
    subtitle: `Por ${actor}${changes.length ? ` · ${changes.join(' · ')}` : ''}`,
    changes,
  };
}
