import { db } from './firebase-config.js';
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, addDoc, deleteDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// ==========================================
// 1. GERENCIAR FILA (COM FILTRO DE DATA)
// ==========================================
const adminFilaList = document.getElementById('adminFilaList');
const dataFilaAdmin = document.getElementById('dataFilaAdmin');

// Variável para guardar a "escuta" do Firebase e não duplicar listas ao trocar de dia
let escutaFilaAtual = null;

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
        if(toast.parentElement) toast.remove();
    }, 4000);
}

function carregarFilaAdmin(dataSelecionada) {
    // Se já tiver uma data sendo ouvida, nós cancelamos ela antes de mudar para a nova
    if (escutaFilaAtual) {
        escutaFilaAtual();
    }

    const filaRef = collection(db, "fila");
    // Agora a consulta usa a data que foi passada na função (dataSelecionada)
    const q = query(filaRef, where("data", "==", dataSelecionada), orderBy("timestamp", "asc"));

    escutaFilaAtual = onSnapshot(q, (snapshot) => {
        if (!adminFilaList) return;
        adminFilaList.innerHTML = '';

        snapshot.forEach((documento) => {
            const cliente = documento.data();
            const id = documento.id;

            const totalCliente = cliente.servicos.reduce((acc, serv) => acc + serv.valor, 0);
            const servicosNomes = cliente.servicos.map(s => s.nome).join(', ');

if (cliente.status === 'aguardando' || cliente.status === 'cortando') {
                const isCortando = cliente.status === 'cortando';
                
                // Limpa o número para o link da API (tira os parênteses, espaços e traços)
                const numeroLimpo = cliente.whatsapp ? cliente.whatsapp.replace(/\D/g, '') : '';
                
                // Botão do WhatsApp (só aparece se o cliente cadastrou o número)
                const btnWhatsapp = cliente.whatsapp ? 
                    `<a href="https://wa.me/55${numeroLimpo}" target="_blank" style="display: block; text-align: center; background: linear-gradient(135deg, #25D366, #128C7E); color: white; padding: 12px; border-radius: 8px; font-weight: bold; text-decoration: none; margin-bottom: 10px; box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3); transition: all 0.3s ease;">
                        💬 Chamar no WhatsApp
                    </a>` : '';

                adminFilaList.innerHTML += `
                    <div class="cliente-card ${isCortando ? 'destaque' : ''}">
                        <h3>${cliente.nome}</h3>
                        <p style="margin: 5px 0; color: #a0a0a0;">📱 ${cliente.whatsapp || 'Não informado'}</p>
                        <p>Serviços: ${servicosNomes} (R$ ${totalCliente.toFixed(2)})</p>
                        <p>Status: <strong>${cliente.status.toUpperCase()}</strong></p>
                        
                        <div class="acoes" style="margin-top: 15px;">
                            ${btnWhatsapp}
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${!isCortando ? `<button onclick="alterarStatus('${id}', 'cortando')" style="flex: 1; background-color: #d4af37; color: black;">✂️ Iniciar</button>` : ''}
                                <button onclick="alterarStatus('${id}', 'concluido')" class="btn-success" style="flex: 1;">✅ Concluir</button>
                                <button onclick="alterarStatus('${id}', 'ausente')" class="btn-danger" style="flex: 1;">❌ Ausente</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        if (snapshot.empty) {
            // Formata a data para a mensagem de erro ficar amigável
            const partes = dataSelecionada.split('-');
            const dataFormatada = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataSelecionada;
            adminFilaList.innerHTML = `<p style="color: #a0a0a0;">Nenhum cliente na fila (Aguardando ou Cortando) para o dia ${dataFormatada}.</p>`;
        }
    });
}

// Evento que dispara sempre que o administrador escolhe uma data diferente no calendário
if (dataFilaAdmin) {
    dataFilaAdmin.addEventListener('change', (e) => {
        carregarFilaAdmin(e.target.value);
    });
}

// Função global para atualizar o status
window.alterarStatus = async function (id, novoStatus) {
    const clienteRef = doc(db, "fila", id);
    try {
        await updateDoc(clienteRef, { status: novoStatus });
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
    }
}

// Função global para os botões do HTML chamarem
window.alterarStatus = async function (id, novoStatus) {
    const clienteRef = doc(db, "fila", id);
    try {
        await updateDoc(clienteRef, {
            status: novoStatus
        });
        // Se mudou para concluído, isso afetará o financeiro automaticamente!
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
    }
}



// ==========================================
// 2. FINANCEIRO (COM FILTROS)
// ==========================================
let clientesConcluidosGlobais = [];

function processarFinanceiro() {
    const filtroMesVal = document.getElementById('filtroMes').value; // Formato: YYYY-MM
    const filtroSemanaVal = document.getElementById('filtroSemana').value; // Formato: YYYY-MM-DD

    // --- LÓGICA DA SEMANA ---
    // Se o usuário não escolheu data, usamos o dia de hoje como base
    const dataRefSemana = filtroSemanaVal ? new Date(filtroSemanaVal + "T12:00:00") : new Date();
    
    const inicioSemana = new Date(dataRefSemana);
    inicioSemana.setDate(dataRefSemana.getDate() - dataRefSemana.getDay()); // Domingo
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6); // Sábado

    const formatoData = (data) => `${data.getDate().toString().padStart(2, '0')}/${(data.getMonth() + 1).toString().padStart(2, '0')}/${data.getFullYear()}`;
    const nomeDaSemana = `${formatoData(inicioSemana)} a ${formatoData(fimSemana)}`;

    // --- LÓGICA DO MÊS ---
    let mesFiltrado, anoFiltradoParaMes;
    if (filtroMesVal) {
        const partesMes = filtroMesVal.split('-');
        anoFiltradoParaMes = parseInt(partesMes[0]);
        mesFiltrado = parseInt(partesMes[1]) - 1; // O JavaScript conta os meses de 0 a 11
    } else {
        const dataAtualMes = new Date();
        anoFiltradoParaMes = dataAtualMes.getFullYear();
        mesFiltrado = dataAtualMes.getMonth();
    }

    // --- LÓGICA DO ANO (Sempre mostra o ano atual para ter uma métrica geral) ---
    const anoAtual = new Date().getFullYear();

    let totalAnual = 0;
    let totalMensal = 0;
    let totalSemanal = 0;

    clientesConcluidosGlobais.forEach(cliente => {
        const dataAtendimento = new Date(cliente.data + "T12:00:00");
        const valorCorte = cliente.servicos.reduce((acc, serv) => acc + serv.valor, 0);

        // Soma Anual
        if (dataAtendimento.getFullYear() === anoAtual) {
            totalAnual += valorCorte;
        }
        
        // Soma do Mês Filtrado
        if (dataAtendimento.getFullYear() === anoFiltradoParaMes && dataAtendimento.getMonth() === mesFiltrado) {
            totalMensal += valorCorte;
        }

        // Soma da Semana Filtrada
        if (dataAtendimento >= inicioSemana && dataAtendimento <= fimSemana) {
            totalSemanal += valorCorte;
        }
    });

    document.getElementById('balancoSemanal').innerHTML = `R$ ${totalSemanal.toFixed(2)} <br><small style="font-size:12px; color:#ccc;">${nomeDaSemana}</small>`;
    document.getElementById('balancoMensal').innerText = `R$ ${totalMensal.toFixed(2)}`;
    document.getElementById('balancoAnual').innerText = `R$ ${totalAnual.toFixed(2)}`;
}

// Escuta as alterações no Firebase em tempo real
function calcularBalançoFinanceiro() {
    const filaRef = collection(db, "fila");
    const q = query(filaRef, where("status", "==", "concluido"));

    onSnapshot(q, (snapshot) => {
        clientesConcluidosGlobais = [];
        snapshot.forEach((doc) => clientesConcluidosGlobais.push(doc.data()));
        
        // Processa com os filtros atuais sempre que o banco atualizar
        processarFinanceiro();
    });
}

// Dispara o recálculo quando o Carlos altera os filtros na tela
if (document.getElementById('filtroMes')) {
    document.getElementById('filtroMes').addEventListener('change', processarFinanceiro);
}
if (document.getElementById('filtroSemana')) {
    document.getElementById('filtroSemana').addEventListener('change', processarFinanceiro);
}


// ==========================================
// 3. SERVIÇOS E VALORES
// ==========================================
const formServico = document.getElementById('formServico');
const listaServicosAdmin = document.getElementById('listaServicosAdmin');

function carregarServicosAdmin() {
    const servicosRef = collection(db, "servicos");

    onSnapshot(servicosRef, (snapshot) => {
        if (listaServicosAdmin) listaServicosAdmin.innerHTML = '';

        snapshot.forEach((documento) => {
            const servico = documento.data();
            const id = documento.id;

            if (listaServicosAdmin) {
                listaServicosAdmin.innerHTML += `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #2a2d34; margin-bottom: 8px; border-radius: 4px;">
                        <span><strong>${servico.nome}</strong> - R$ ${servico.valor.toFixed(2)}</span>
                        <button onclick="deletarServico('${id}')" class="btn-danger" style="padding: 6px 12px;">Excluir</button>
                    </li>
                `;
            }
        });
    });
}

if (formServico) {
    formServico.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('nomeServico').value;
        const valor = parseFloat(document.getElementById('valorServico').value);

        try {
            await addDoc(collection(db, "servicos"), { nome: nome, valor: valor });
            mostrarNotificacao("Serviço cadastrado com sucesso!", "success");
            formServico.reset();
        } catch (error) {
            console.error("Erro ao cadastrar serviço:", error);
        }
    });
}

window.deletarServico = async function (id) {
    if (confirm("Tem certeza que deseja excluir este serviço?")) {
        await deleteDoc(doc(db, "servicos", id));
    }
}


// ==========================================
// 4. GERENCIAR DATAS (BLOQUEIO E DESBLOQUEIO)
// ==========================================
const listaDatasAdmin = document.getElementById('listaDatasAdmin');

// A. Carregar e mostrar as datas que já estão bloqueadas
function carregarDatasBloqueadas() {
    const datasRef = collection(db, "datas_indisponiveis");

    onSnapshot(datasRef, (snapshot) => {
        if (listaDatasAdmin) listaDatasAdmin.innerHTML = '';

        snapshot.forEach((documento) => {
            const dataDoc = documento.data();
            const id = documento.id;

            // Formatando a data (de 2026-07-10 para 10/07/2026) para ficar mais visual
            const partes = dataDoc.data.split('-');
            const dataFormatada = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dataDoc.data;

            if (listaDatasAdmin) {
                listaDatasAdmin.innerHTML += `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #2a2d34; margin-bottom: 8px; border-radius: 4px; border-left: 4px solid #dc3545;">
                        <span>🔒 <strong>${dataFormatada}</strong> está bloqueada</span>
                        <button onclick="desbloquearData('${id}')" class="btn-success" style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">✅ Desbloquear</button>
                    </li>
                `;
            }
        });

        if (snapshot.empty && listaDatasAdmin) {
            listaDatasAdmin.innerHTML = '<p style="color: #a0a0a0;">Nenhuma data bloqueada no momento. A agenda está livre.</p>';
        }
    });
}

// B. Bloquear uma nova data
window.bloquearData = async function () {
    const dataInput = document.getElementById('dataBloqueio').value;
    if (!dataInput) return mostrarNotificacao("Selecione uma data para bloquear.", "info");

    try {
        // Verifica se a data já está bloqueada para não duplicar
        const datasRef = collection(db, "datas_indisponiveis");
        const q = query(datasRef, where("data", "==", dataInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            return mostrarNotificacao("Esta data já está bloqueada!", "error");
        }

        // Se não estiver bloqueada, ele salva no banco
        await addDoc(datasRef, { data: dataInput });
        mostrarNotificacao("Data bloqueada com sucesso!", "success");
        document.getElementById('dataBloqueio').value = ''; // Limpa o campo

    } catch (error) {
        console.error("Erro ao bloquear:", error);
    }
}

// C. Desbloquear a data (Apagar do banco)
window.desbloquearData = async function (id) {
    if (confirm("Tem certeza que deseja desbloquear esta data? Os clientes poderão voltar a se cadastrar nela.")) {
        try {
            await deleteDoc(doc(db, "datas_indisponiveis", id));
        } catch (error) {
            console.error("Erro ao desbloquear data:", error);
        }
    }
}



// ==========================================
// 5. HISTÓRICO DE CLIENTES
// ==========================================
const listaHistoricoAdmin = document.getElementById('listaHistoricoAdmin');

function carregarHistoricoAdmin() {
    const filaRef = collection(db, "fila");
    // Busca todos os clientes, do mais recente ao mais antigo
    const q = query(filaRef, orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        if (listaHistoricoAdmin) listaHistoricoAdmin.innerHTML = '';

        snapshot.forEach((documento) => {
            const cliente = documento.data();

            // Só exibe se o timestamp já tiver sido gravado no servidor
            if (cliente.timestamp) {
                const totalCliente = cliente.servicos.reduce((acc, serv) => acc + serv.valor, 0);
                const servicosNomes = cliente.servicos.map(s => s.nome).join(', ');

                // Formatação da data (de YYYY-MM-DD para DD/MM/YYYY)
                const partes = cliente.data.split('-');
                const dataFormatada = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : cliente.data;

                // Definindo a cor e o ícone com base no status do cliente
                let statusHtml = '';
                if (cliente.status === 'concluido') {
                    statusHtml = '<span style="color: #28a745; font-weight: bold;">✅ Concluído</span>';
                } else if (cliente.status === 'ausente') {
                    statusHtml = '<span style="color: #dc3545; font-weight: bold;">❌ Ausente</span>';
                } else if (cliente.status === 'cortando') {
                    statusHtml = '<span style="color: var(--gold); font-weight: bold;">✂️ Cortando</span>';
                } else {
                    statusHtml = '<span style="color: #a0a0a0; font-weight: bold;">⏳ Aguardando</span>';
                }

                if (listaHistoricoAdmin) {
                    listaHistoricoAdmin.innerHTML += `
                        <li style="display: flex; flex-direction: column; padding: 15px; background: #2a2d34; margin-bottom: 10px; border-radius: 4px; border-left: 4px solid var(--gold);">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="font-size: 1.1rem;">${cliente.nome}</strong>
                                <span>🗓️ ${dataFormatada}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #ccc;">
                                <span>Serviços: ${servicosNomes} <strong style="color:white;">(R$ ${totalCliente.toFixed(2)})</strong></span>
                                ${statusHtml}
                            </div>
                        </li>
                    `;
                }
            }
        });

        if (snapshot.empty && listaHistoricoAdmin) {
            listaHistoricoAdmin.innerHTML = '<p style="color: #a0a0a0;">Nenhum histórico encontrado no sistema.</p>';
        }
    });
}

// ==========================================
// 6. CONFIGURAÇÃO DE HORÁRIOS DE ATENDIMENTO
// ==========================================
const docHorarioRef = doc(db, "configuracoes", "horario_atendimento");

// Escuta e preenche o painel com o horário atual salvo
onSnapshot(docHorarioRef, (docSnap) => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        const check24h = document.getElementById('check24h');
        const inputAbertura = document.getElementById('horaAbertura');
        const inputFechamento = document.getElementById('horaFechamento');

        if(check24h && inputAbertura && inputFechamento) {
            check24h.checked = data.is24h || false;
            inputAbertura.value = data.abertura || '';
            inputFechamento.value = data.fechamento || '';
            
            inputAbertura.disabled = data.is24h;
            inputFechamento.disabled = data.is24h;
        }
    }
});

// Evento para desativar os campos de hora ao clicar em 24h
const check24hElement = document.getElementById('check24h');
if(check24hElement){
    check24hElement.addEventListener('change', (e) => {
        document.getElementById('horaAbertura').disabled = e.target.checked;
        document.getElementById('horaFechamento').disabled = e.target.checked;
    });
}

// Salva o horário no banco de dados (Global no window)
window.salvarHorarios = async function() {
    const is24h = document.getElementById('check24h').checked;
    const abertura = document.getElementById('horaAbertura').value;
    const fechamento = document.getElementById('horaFechamento').value;

    // Validação
    if (!is24h && (!abertura || !fechamento)) {
        if(window.mostrarNotificacao) {
            window.mostrarNotificacao("Preencha abertura e fechamento, ou marque 24h.", "error");
        } else {
            alert("Preencha abertura e fechamento, ou marque 24h.");
        }
        return;
    }

    try {
        await setDoc(docHorarioRef, { 
            is24h: is24h, 
            abertura: abertura, 
            fechamento: fechamento 
        });
        
        if(window.mostrarNotificacao) {
            window.mostrarNotificacao("Horários atualizados com sucesso!", "success");
        } else {
            alert("Horários atualizados com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao salvar horário:", error);
    }
};

// ==========================================
// INICIALIZAÇÃO DO SISTEMA
// ==========================================

const dataHoje = new Date().toISOString().split('T')[0];
if (document.getElementById('dataFilaAdmin')) document.getElementById('dataFilaAdmin').value = dataHoje;
carregarFilaAdmin(dataHoje);

// Configura os filtros financeiros com a data/mês atual
const dataMesAtual = dataHoje.substring(0, 7); // Pega apenas o "YYYY-MM"
if(document.getElementById('filtroMes')) document.getElementById('filtroMes').value = dataMesAtual;
if(document.getElementById('filtroSemana')) document.getElementById('filtroSemana').value = dataHoje;

calcularBalançoFinanceiro();
carregarServicosAdmin();
carregarDatasBloqueadas();
carregarHistoricoAdmin();