# HOUSE 190 — Painel de Gestão Integrada

Plataforma web empresarial para centralizar as operações administrativas, financeiras, fiscais e de pessoas da **House 190**.

---

## 🏢 Unidades Atendidas
1. **Central de Produção** (`CP`)
2. **House 190 Eunápolis** (`EUN`)
3. **House 190 Teixeira de Freitas** (`TXF`)
4. **House Foodpark** (`FDP`)

---

## 🚀 Tecnologias
- **Framework**: Next.js 14+ (App Router) + React 18 + TypeScript
- **Estilização**: Tailwind CSS (Design system refinado inspirado em Linear, Stripe e Vercel)
- **Componentes**: Radix UI + Componentes customizados (DataTables, Drawers, Modals, Badges)
- **Ícones**: Lucide React
- **Gráficos**: Recharts
- **Banco de Dados**: PostgreSQL / Supabase com Row Level Security (RLS)
- **App**: Progressive Web App (PWA)

---

## 📦 Módulos da Aplicação
- **Seletor Global de Unidades**: Filtragem em tempo real de todo o sistema.
- **Dashboard Executivo**: KPIs com variação mensal, bloco de *Atenção Necessária*, curvas de faturamento e comparativo entre filiais.
- **Financeiro & Contas a Pagar**: Lançamentos, parcelamentos automáticos (1/N a N/N), central de pagamentos com baixa em lote e fluxo de aprovações por alçadas.
- **Fornecedores**: Perfis empresariais detalhados com histórico financeiro e chaves PIX.
- **Fiscal & Impostos**: Guias fiscais (DAS, ICMS, FGTS, ISS), códigos de barra e calendário tributário.
- **Faturamento Diário**: Apuração diária por loja de receita bruta, descontos e receita líquida.
- **Metas & Projeções**: Barras de progresso lineares ultra-finas, médias diárias necessárias e projeção matemática de fechamento.
- **RH & Gestão de Pessoas**: Colaboradores, calendário de férias com detecção de conflitos, funil de admissão e registros de 1:1.
- **Tarefas & Projetos**: Quadro Kanban interativo com checklists e comentários em thread.
- **Documentos & Compliance**: Repositório categorizado com avisos de validade de alvarás.
- **Busca Global (`CMD+K`)**: Command Palette veloz indexando todas as entidades.
- **Trilha de Auditoria**: Histórico imutável de eventos (`activity_logs`).

---

## 🛠️ Como Executar Localmente

### 1. Clonar o repositório
```bash
git clone https://github.com/houseburgertx-beep/gestao.git
cd gestao
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Rodar em desenvolvimento
```bash
npm run dev
```
Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

### 4. Build de produção
```bash
npm run build
npm run start
```

---

## 🗄️ Banco de Dados (Supabase)
O schema relacional completo com tabelas, RLS e seeds de demonstração está localizado em:
[`supabase/schema.sql`](supabase/schema.sql)
