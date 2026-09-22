import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDocs, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('filaForm');
const listaServicosDiv = document.getElementById('listaServicos');
const filaAtualUl = document.getElementById('filaAtual');
const dataInput = document.getElementById('dataEscolhida');

// Função global de notificação
function mostrarNotificacao(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
        <span>${mensagem}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    // Remove do HTML após 4 segundos (4000 ms)
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4000);
}


// 1. Carregar os Serviços Disponíveis do Banco
async function carregarServicos() {
    const servicosRef = collection(db, "servicos");
    const snapshot = await getDocs(servicosRef);

    listaServicosDiv.innerHTML = '';

    snapshot.forEach((doc) => {
        const servico = doc.data();
        listaServicosDiv.innerHTML += `
            <label>
                <input type="checkbox" name="servico" value="${servico.nome}" data-valor="${servico.valor}">
                ${servico.nome} - R$ ${servico.valor.toFixed(2)}
            </label><br>
        `;
    });
}

// 2. Ouvir a Fila em Tempo Real (Filtrando pela data escolhida)
function escutarFila(data) {
    const filaRef = collection(db, "fila");
    // Busca apenas pessoas da data selecionada, ordenadas pela hora que entraram
    const q = query(filaRef, where("data", "==", data), orderBy("timestamp", "asc"));

    onSnapshot(q, (snapshot) => {
        filaAtualUl.innerHTML = '';
        let posicao = 1;

        snapshot.forEach((doc) => {
            const cliente = doc.data();
            // Mostra apenas quem está aguardando ou cortando
            if (cliente.status === 'aguardando' || cliente.status === 'cortando') {
                const statusBadge = cliente.status === 'cortando' ? '✂️ Cortando agora' : '⏳ Aguardando';

                filaAtualUl.innerHTML += `
                    <li>
                        <strong>${posicao}º - ${cliente.nome}</strong> 
                        <span class="status">${statusBadge}</span>
                    </li>
                `;
                posicao++;
            }
        });

        if (snapshot.empty) {
            filaAtualUl.innerHTML = '<li>Nenhum cliente na fila para esta data ainda.</li>';
        }
    });
}

// ==========================================
// MOSTRAR HORÁRIO DE ATENDIMENTO
// ==========================================
const docHorarioRef = doc(db, "configuracoes", "horario_atendimento");
const horarioTexto = document.getElementById('horarioFuncionamento');

// Variável global para guardar a configuração
let configuracaoHorario = { is24h: true, abertura: '00:00', fechamento: '23:59' };

onSnapshot(docHorarioRef, (docSnap) => {
    if (docSnap.exists()) {
        configuracaoHorario = docSnap.data(); // Guarda os dados atualizados

        if (configuracaoHorario.is24h) {
            horarioTexto.innerHTML = "🕒 <strong>Atendimento 24 Horas</strong>";
        } else {
            horarioTexto.innerHTML = `🕒 Lista aberta das <strong>${configuracaoHorario.abertura} às ${configuracaoHorario.fechamento}</strong>`;
        }
    } else {
        horarioTexto.innerHTML = "🕒 Horários ainda não definidos pelo barbeiro.";
    }
});
// 3. Cadastrar Cliente na Fila com Verificação de Data Bloqueada
form.addEventListener('submit', async (e) => {
    e.preventDefault();


    // ==========================================
    // 0. VERIFICAÇÃO DO HORÁRIO DE FUNCIONAMENTO
    // ==========================================
    if (!configuracaoHorario.is24h && configuracaoHorario.abertura && configuracaoHorario.fechamento) {
        const agora = new Date();
        const horaAtual = agora.getHours();
        const minAtual = agora.getMinutes();
        const tempoAtualEmMinutos = (horaAtual * 60) + minAtual;

        // Converte as horas do banco em minutos para facilitar a comparação
        const [aberturaHora, aberturaMin] = configuracaoHorario.abertura.split(':').map(Number);
        const tempoAbertura = (aberturaHora * 60) + aberturaMin;

        const [fechamentoHora, fechamentoMin] = configuracaoHorario.fechamento.split(':').map(Number);
        const tempoFechamento = (fechamentoHora * 60) + fechamentoMin;

        let estaAberto = false;

        if (tempoFechamento >= tempoAbertura) {
            // Ex: 08:00 às 22:00 (Ocorre no mesmo dia)
            estaAberto = tempoAtualEmMinutos >= tempoAbertura && tempoAtualEmMinutos <= tempoFechamento;
        } else {
            // Ex: 18:00 às 02:00 (O horário vira a madrugada para o dia seguinte)
            estaAberto = tempoAtualEmMinutos >= tempoAbertura || tempoAtualEmMinutos <= tempoFechamento;
        }

        if (!estaAberto) {
            mostrarNotificacao(`Estamos fechados! O horário de atendimento é das ${configuracaoHorario.abertura} às ${configuracaoHorario.fechamento}.`, "error");
            return; // Bloqueia o envio aqui mesmo e não continua o código
        }
    }

    const data = dataInput.value;
    // VERIFICAÇÃO DE DATA BLOQUEADA
    const datasRef = collection(db, "datas_indisponiveis");
    const bloqueioQuery = query(datasRef, where("data", "==", data));
    const datasSnap = await getDocs(bloqueioQuery);

    if (!datasSnap.empty) {
        mostrarNotificacao("Agenda encerrada ou indisponível para esta data.", "error");
        return; // Impede o cliente de se cadastrar se a data estiver bloqueada
    }
   
    

    // Continua com o cadastro se a data estiver livre
    const nome = document.getElementById('nomeCliente').value;
    const whatsapp = document.getElementById('whatsappCliente').value;
    // Pega todos os serviços que o cliente marcou
    const servicosSelecionados = Array.from(document.querySelectorAll('input[name="servico"]:checked')).map(cb => ({
        nome: cb.value,
        valor: parseFloat(cb.dataset.valor)
    }));

    if (servicosSelecionados.length === 0) {
        mostrarNotificacao("Por favor, selecione pelo menos um serviço.", "info");
        return;
    }

    try {
        await addDoc(collection(db, "fila"), {
            nome: nome,
            whatsapp: whatsapp,
            data: data,
            servicos: servicosSelecionados,
            status: "aguardando",
            timestamp: serverTimestamp() // Garante a ordem exata de chegada
        });

        mostrarNotificacao("Você entrou na fila com sucesso!", "success");
        form.reset();

        // Define a data de volta para a que o usuário estava olhando
        dataInput.value = data;

    } catch (error) {
        console.error("Erro ao entrar na fila: ", error);
        mostrarNotificacao("Erro ao processar. Tente novamente.", "error");
    }

});

// Inicialização
const hoje = new Date().toISOString().split('T')[0];
dataInput.value = hoje;
carregarServicos();
escutarFila(hoje);

// Atualiza a fila se o cliente mudar a data no calendário
dataInput.addEventListener('change', (e) => {
    escutarFila(e.target.value);
});

// ==========================================
// TELA DE BEM-VINDO (SPLASH SCREEN)
// ==========================================
window.addEventListener('load', () => {
    const splashScreen = document.getElementById('splash-screen');

    if (splashScreen) {
        setTimeout(() => {
            // Primeiro esmaece a tela (fica invisível suavemente pelo CSS)
            splashScreen.style.opacity = '0';
            splashScreen.style.visibility = 'hidden';

            // Depois de meio segundo da animação terminar, remove do HTML para não pesar
            setTimeout(() => {
                splashScreen.remove();
            }, 600);

        }, 2000); // 2000 milissegundos = 2 segundos
    }
});

// ==========================================
// MÁSCARA AUTOMÁTICA DO WHATSAPP
// ==========================================
const inputWhatsapp = document.getElementById('whatsappCliente');
if (inputWhatsapp) {
    inputWhatsapp.addEventListener('input', function (e) {
        let valor = e.target.value.replace(/\D/g, ''); // Remove tudo que não for número
        let formatado = valor;

        if (valor.length > 2) {
            formatado = `(${valor.substring(0, 2)}) ${valor.substring(2)}`;
        }
        if (valor.length > 7) {
            formatado = `(${valor.substring(0, 2)}) ${valor.substring(2, 7)}-${valor.substring(7, 11)}`;
        }

        e.target.value = formatado;
    });
}