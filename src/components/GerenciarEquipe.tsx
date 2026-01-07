// CORREÇÃO AQUI: Adicionado 'type' antes de FormEvent
import { useState, useEffect, type FormEvent } from "react";
import { AxiosError } from "axios";
import { api } from "../services/api";

// --- 1. Interfaces (Tipagem) ---

// O formato que vem do Banco de Dados
interface BackendUser {
  id: string;
  nome: string;
  email: string;
  cargo: string;
}

// O formato da resposta da Rota /team
interface TeamResponse {
  plan: {
    limit: number;
    owner: BackendUser;
    name?: string;
  };
  members: BackendUser[];
}

// O formato que usamos visualmente no React
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// O estado geral da tela
interface TeamDataState {
  members: User[];
  planLimit: number;
  owner: User | null;
}

// Interface para o erro que vem do backend
interface ApiErrorResponse {
  error: string;
}

const TeamManagement = () => {
  const [loading, setLoading] = useState<boolean>(true);

  const [teamData, setTeamData] = useState<TeamDataState>({
    members: [],
    planLimit: 5,
    owner: null,
  });

  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({
    nome: "",
    email: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);

  // --- Função de Buscar Dados ---
  const fetchTeamData = async () => {
    try {
      // Aqui dizemos ao Axios que a resposta segue a interface TeamResponse
      const response = await api.get<TeamResponse>("/team");
      const backendData = response.data;

      setTeamData({
        // O TypeScript agora sabe que 'm' é BackendUser, então aceita m.nome
        members: backendData.members.map((m) => ({
          id: m.id,
          name: m.nome,
          email: m.email,
          role: m.cargo,
        })),
        planLimit: backendData.plan.limit,

        owner: backendData.plan.owner
          ? {
              id: backendData.plan.owner.id,
              name: backendData.plan.owner.nome,
              email: backendData.plan.owner.email,
              role: "Admin",
            }
          : null,
      });
    } catch (error) {
      console.error("Erro ao carregar equipe:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, []);

  // --- Função de Salvar ---
  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await api.post("/team/add", newMember);

      alert("Membro adicionado com sucesso!");
      setIsModalOpen(false);
      setNewMember({ nome: "", email: "", password: "" });
      fetchTeamData();
    } catch (err) {
      // Tratamento de erro tipado
      const error = err as AxiosError<ApiErrorResponse>;
      const msg = error.response?.data?.error || "Erro ao adicionar membro.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  // --- Cálculos ---
  const fullTeamList = teamData.owner
    ? [teamData.owner, ...teamData.members]
    : [];

  const totalUsed = fullTeamList.length;
  const isFull = totalUsed >= teamData.planLimit;
  const progressPercentage = Math.min(
    (totalUsed / teamData.planLimit) * 100,
    100
  );

  if (loading)
    return (
      <div className="text-white p-6">Carregando dados da assinatura...</div>
    );

  return (
    <div className="p-6 text-white max-w-4xl mx-auto relative z-50 min-h-screen bg-gray-900">
      {/* HEADER */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-xl font-bold">Membros da Equipe</h2>
            <p className="text-gray-400 text-sm mt-1">
              Gerencie quem tem acesso à sua conta corporativa.
            </p>
          </div>
          <div
            className={`px-4 py-1 rounded-full font-mono font-bold text-sm border 
            ${
              isFull
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-green-500/10 text-green-400 border-green-500/20"
            }`}
          >
            {totalUsed} / {teamData.planLimit} Licenças Usadas
          </div>
        </div>
        <div className="w-full bg-gray-700 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ease-out ${
              isFull ? "bg-red-500" : "bg-green-500"
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* BOTÃO ADICIONAR */}
      <div className="flex justify-end mb-6">
        <button
          disabled={isFull}
          onClick={() => setIsModalOpen(true)}
          className={`px-6 py-2 rounded-lg font-semibold transition-colors
            ${
              isFull
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
            }`}
        >
          {isFull ? "Limite Atingido" : "+ Adicionar Novo Membro"}
        </button>
      </div>

      {/* LISTA */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        {fullTeamList.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-4 border-b border-gray-800 last:border-0 hover:bg-gray-800/50"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-300">
                {user.name ? user.name.substring(0, 2).toUpperCase() : "??"}
              </div>
              <div>
                <p className="font-medium text-gray-200">
                  {user.name}
                  {user.id === teamData.owner?.id && (
                    <span className="text-gray-500 text-sm font-normal">
                      {" "}
                      (Você)
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <div>
              {user.id === teamData.owner?.id || user.role === "Admin" ? (
                <span className="px-3 py-1 text-xs font-bold text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full uppercase tracking-wider">
                  Admin
                </span>
              ) : (
                <span className="px-3 py-1 text-xs font-bold text-gray-400 bg-gray-700/50 border border-gray-600 rounded-full uppercase tracking-wider">
                  Colaborador
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-white">Novo Membro</h3>
            <p className="text-gray-400 text-sm mb-6">
              Crie uma conta para seu colaborador. Ele herdará o acesso ao plano
              da empresa.
            </p>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                  value={newMember.nome}
                  onChange={(e) =>
                    setNewMember({ ...newMember, nome: e.target.value })
                  }
                  placeholder="Ex: João Silva"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  E-mail Profissional
                </label>
                <input
                  type="email"
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                  value={newMember.email}
                  onChange={(e) =>
                    setNewMember({ ...newMember, email: e.target.value })
                  }
                  placeholder="joao@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Senha Provisória
                </label>
                <input
                  type="password"
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none"
                  value={newMember.password}
                  onChange={(e) =>
                    setNewMember({ ...newMember, password: e.target.value })
                  }
                  placeholder="******"
                />
              </div>

              <div className="flex gap-3 mt-6 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Cadastrar Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;
