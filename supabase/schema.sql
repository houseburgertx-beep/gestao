-- ============================================================================
-- HOUSE 190 — BANCO DE DADOS POSTGRESQL / SUPABASE
-- Schema Relacional Completo, RLS Policies, Triggers de Auditoria e Seeds Iniciais
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ESTRUTURA ORGANIZACIONAL & MULTIUNIDADE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(50) PRIMARY KEY, -- 'central', 'eunapolis', 'teixeira', 'foodpark'
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL,
    cnpj VARCHAR(18),
    address TEXT,
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. USUÁRIOS, PERFIS E CONTROLE DE ACESSO (RBAC)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY, -- 'admin', 'diretoria', 'financeiro', 'rh', 'gestor', 'gerente_unidade', 'colaborador'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    role_id VARCHAR(50) REFERENCES roles(id) DEFAULT 'colaborador',
    can_view_salaries BOOLEAN DEFAULT FALSE,
    can_approve_payments BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_manage BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, unit_id)
);

-- ----------------------------------------------------------------------------
-- 3. FORNECEDORES & CATEGORIAS FINANCEIRAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255) NOT NULL,
    cnpj_cpf VARCHAR(20) NOT NULL,
    phone VARCHAR(30),
    whatsapp VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    category VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100),
    bank_agency VARCHAR(20),
    bank_account VARCHAR(30),
    pix_key VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'despesa', -- 'despesa' | 'receita'
    description TEXT
);

CREATE TABLE IF NOT EXISTS cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    unit_id VARCHAR(50) REFERENCES units(id) ON DELETE CASCADE,
    code VARCHAR(20)
);

-- ----------------------------------------------------------------------------
-- 4. CONTAS A PAGAR, PARCELAMENTOS & APROVAÇÕES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    company_cnpj VARCHAR(18),
    description VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    cost_center VARCHAR(100),
    competence VARCHAR(7) NOT NULL, -- MM/YYYY
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    interest NUMERIC(12, 2) DEFAULT 0.00,
    penalty NUMERIC(12, 2) DEFAULT 0.00,
    discount NUMERIC(12, 2) DEFAULT 0.00,
    final_amount NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'pix',
    bank_account VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending_approval', -- 'draft', 'pending_approval', 'approved', 'scheduled', 'paid', 'overdue', 'canceled'
    responsible_user VARCHAR(255) NOT NULL,
    approval_tier VARCHAR(20) DEFAULT 'auto', -- 'auto', 'manager', 'director'
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_proof_url TEXT,
    barcode TEXT,
    invoice_number VARCHAR(100),
    installment_number INT,
    total_installments INT,
    installment_group_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES profiles(id),
    reviewer_id UUID REFERENCES profiles(id),
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'adjustment_requested'
    approval_tier VARCHAR(20) NOT NULL,
    comment TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. FISCAL & IMPOSTOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS taxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    company_cnpj VARCHAR(18) NOT NULL,
    tax_type VARCHAR(50) NOT NULL, -- 'DAS', 'ICMS', 'FGTS', 'INSS', 'ISS', 'PIS/COFINS'
    competence VARCHAR(7) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'upcoming', -- 'upcoming', 'pending_payment', 'paid', 'overdue', 'installment'
    barcode TEXT,
    guide_url TEXT,
    proof_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. FATURAMENTO DIÁRIO & METAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS revenues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    entry_date DATE NOT NULL,
    gross_revenue NUMERIC(12, 2) NOT NULL,
    discounts NUMERIC(12, 2) DEFAULT 0.00,
    cancellations NUMERIC(12, 2) DEFAULT 0.00,
    net_revenue NUMERIC(12, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(unit_id, entry_date)
);

CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    month INT NOT NULL,
    year INT NOT NULL,
    target_amount NUMERIC(12, 2) NOT NULL,
    current_realized NUMERIC(12, 2) DEFAULT 0.00,
    previous_month_realized NUMERIC(12, 2) DEFAULT 0.00,
    UNIQUE(unit_id, month, year)
);

-- ----------------------------------------------------------------------------
-- 7. RH & GESTÃO DE PESSOAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) UNIQUE NOT NULL,
    birth_date DATE,
    phone VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    department VARCHAR(100) NOT NULL,
    role VARCHAR(100) NOT NULL,
    admission_date DATE NOT NULL,
    salary NUMERIC(12, 2) NOT NULL,
    contract_type VARCHAR(20) DEFAULT 'CLT',
    work_hours VARCHAR(100),
    manager_name VARCHAR(255),
    status VARCHAR(30) DEFAULT 'active', -- 'active', 'vacation', 'leave', 'terminated'
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_vacations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    unit_id VARCHAR(50) NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    vesting_period_start DATE NOT NULL,
    vesting_period_end DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    status VARCHAR(30) DEFAULT 'planned', -- 'planned', 'requested', 'approved', 'in_progress', 'completed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. TAREFAS & PROJETOS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) REFERENCES units(id) ON DELETE SET NULL,
    project VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_name VARCHAR(255),
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    due_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'todo', -- 'todo', 'in_progress', 'waiting', 'done', 'canceled'
    tags TEXT[],
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text VARCHAR(255) NOT NULL,
    is_done BOOLEAN DEFAULT FALSE,
    order_index INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. DOCUMENTOS & AUDITORIA
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id VARCHAR(50) REFERENCES units(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    expiration_date DATE,
    size_bytes BIGINT,
    format VARCHAR(10),
    storage_path TEXT NOT NULL,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),
    user_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem ler unidades autorizadas
CREATE POLICY "Permitir leitura de unidades associadas" ON units
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_units
            WHERE user_units.user_id = auth.uid()
            AND user_units.unit_id = units.id
            AND user_units.can_view = TRUE
        )
        OR (
            SELECT role_id FROM profiles WHERE id = auth.uid()
        ) IN ('admin', 'diretoria')
    );

-- Contas a Pagar: Isolamento por unidade
CREATE POLICY "Contas a pagar por unidade autorizada" ON accounts_payable
    FOR SELECT USING (
        deleted_at IS NULL AND (
            EXISTS (
                SELECT 1 FROM user_units
                WHERE user_units.user_id = auth.uid()
                AND user_units.unit_id = accounts_payable.unit_id
                AND user_units.can_view = TRUE
            )
            OR (SELECT role_id FROM profiles WHERE id = auth.uid()) IN ('admin', 'diretoria', 'financeiro')
        )
    );

-- Salários de colaboradores protegidos por flag de permissão
CREATE POLICY "Acesso restrito a informações salariais" ON employees
    FOR SELECT USING (
        (SELECT can_view_salaries FROM profiles WHERE id = auth.uid()) = TRUE
        OR (SELECT role_id FROM profiles WHERE id = auth.uid()) IN ('admin', 'diretoria', 'rh')
    );

-- Activity logs são append-only (sem permissão de DELETE ou UPDATE)
CREATE POLICY "Auditoria imutável" ON activity_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Leitura de logs para admin e diretoria" ON activity_logs
    FOR SELECT USING (
        (SELECT role_id FROM profiles WHERE id = auth.uid()) IN ('admin', 'diretoria')
    );

-- ----------------------------------------------------------------------------
-- 11. SEED DATA (HOUSE 190)
-- ----------------------------------------------------------------------------

INSERT INTO companies (id, legal_name, trade_name, cnpj) VALUES
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'House 190 Hamburgueria e Participações Ltda', 'House 190', '45.190.190/0001-90')
ON CONFLICT (cnpj) DO NOTHING;

INSERT INTO units (id, company_id, name, short_name, code, cnpj, address) VALUES
('central', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Central de Produção', 'Central', 'CP', '45.190.190/0001-90', 'Av. das Indústrias, 190 - Eunápolis/BA'),
('eunapolis', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'House 190 Eunápolis', 'Eunápolis', 'EUN', '45.190.190/0002-71', 'Av. Porto Seguro, 450 - Centro, Eunápolis/BA'),
('teixeira', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'House 190 Teixeira de Freitas', 'Teixeira', 'TXF', '45.190.190/0003-52', 'Av. Getúlio Vargas, 1820 - Teixeira de Freitas/BA'),
('foodpark', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'House Foodpark', 'Foodpark', 'FDP', '45.190.190/0004-33', 'Espaço Gastronômico, Box 04 - Eunápolis/BA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO roles (id, name, description) VALUES
('admin', 'Administrador do Sistema', 'Acesso irrestrito a todos os módulos e configurações'),
('diretoria', 'Diretoria Executiva', 'Acesso pleno a dashboards, aprovações de alto valor e relatórios'),
('financeiro', 'Financeiro & Controladoria', 'Gestão de contas a pagar, conciliação e baixas'),
('rh', 'Recursos Humanos', 'Gestão de colaboradores, férias e admissões'),
('gestor', 'Gestor de Unidade', 'Aprovações operacionais e lançamento de faturamento')
ON CONFLICT (id) DO NOTHING;
