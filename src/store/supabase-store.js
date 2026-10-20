import { randomUUID } from 'node:crypto';
import { UpstreamError } from '../http/errors.js';
import { UUID } from '../tenants.js';
import { mapKey, mapTenant, mapConversation, mapMessage, mapConnector, mapChannel } from './shape.js';

const KEY_ID = /^[0-9a-f]{12}$/;
const OWNER_ID = /^[A-Za-z0-9_-]{1,80}$/;
const OWNER_TYPES = new Set(['user', 'guest', 'service']);
const CONVERSATION_COLUMNS = 'id,tenant_id,owner_type,owner_id,title,created_at,updated_at,expires_at';
const MESSAGE_COLUMNS = 'id,role,content,created_at';

const PROJECT_COLUMNS = 'id,name,description,instructions,status,created_at,updated_at';
const mapProject = (r) => ({ id: r.id, name: r.name, description: r.description, instructions: r.instructions, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const NCC_CONTACT_COLUMNS = 'id,name,email,phone,company,tags,notes,source,created_at,updated_at';
const NCC_DEAL_COLUMNS = 'id,contact_id,title,stage,value,currency,created_at,updated_at';
const mapNccContact = (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, company: r.company, tags: Array.isArray(r.tags) ? r.tags : [], notes: r.notes, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at });
const mapNccDeal = (r) => ({ id: r.id, contactId: r.contact_id, title: r.title, stage: r.stage, value: Number(r.value), currency: r.currency, createdAt: r.created_at, updatedAt: r.updated_at });
const NCC_TASK_COLUMNS = 'id,title,due_at,done,contact_id,deal_id,origin,creat¶»§q«^