// 3. Cadastrar Cliente na Fila com Verificações
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

        const [aberturaHora, aberturaMin] = configuracaoHorario.abertura.split(':').map(Number);
        const tempoAbertura = (aberturaHora * 60) + aberturaMin;

        const [fechamentoHora, fechamentoMin] = configuracaoHorario.fechamento.split(':').map(Number);
        const tempoFechamento = (fechamentoHora * 60) + fechamentoMin;

        let estaAberto = false;
        if (tempoFechamento >= tempoAbertura) {
            estaAberto = tempoAtualEmMinutos >= tempoAbertura && tempoAtualEmMinutos <= tempoFechamento;
        } else {
            estaAberto = tempoAtualEmMinutos >= tempoAbertura || tempoAtualEmMinutos <= tempoFechamento;
        }

        if (!estaAberto) {
            mostrarNotificacao(`Estamos fechados! O horário de atendimento é das ${configuracaoHorario.abertura} às ${configuracaoHorario.fechamento}.`, "error");
            return; 
        }
    }

    const data = dataInput.value;
    
    // ==========================================
    // 1. VERIFICAÇÃO DE DATA BLOQUEADA
    // ==========================================
    const datasRef = collection(db, "datas_indisponiveis");
    const bloqueioQuery = query(datasRef, where("data", "==", data));
    const datasSnap = await getDocs(bloqueioQuery);

    if (!datasSnap.empty) {
        mostrarNotificacao("Agenda encerrada ou indisponível para esta data.", "error");
        return; 
    }

    // ==========================================
    // 2. CADASTRO NORMAL DO CLIENTE (QUESITO B AQUI)
    // ==========================================
    
    // Puxando os dados que o cliente digitou nos campos
    const nome = document.getElementById('nomeCliente').value;
    const whatsapp = document.getElementById('whatsappCliente').value; // <-- PEGOU O NÚMERO
    
    // Puxando os serviços que ele marcou
    const servicosSelecionados = [];
    document.querySelectorAll('input[name="servicos"]:checked').forEach((checkbox) => {
        servicosSelecionados.push({
            nome: checkbox.value,
            valor: parseFloat(checkbox.dataset.valor)
        });
    });

    if (servicosSelecionados.length === 0) {
        mostrarNotificacao("Por favor, selecione pelo menos um serviço.", "info");
        return;
    }

    try {
        // Mandando tudo empacotado para o Firebase
        await addDoc(collection(db, "fila"), {
            nome: nome,
            whatsapp: whatsapp, // <-- SALVOU O NÚMERO NO BANCO DE DADOS
            data: data,
            servicos: servicosSelecionados,
            status: "aguardando",
            timestamp: serverTimestamp()
        });

        // Se deu tudo certo, avisa o cliente e limpa o formulário
        mostrarNotificacao("Você entrou na fila com sucesso!", "success");
        form.reset();
        
    } catch (error) {
        console.error("Erro ao entrar na fila:", error);
        mostrarNotificacao("Erro ao processar. Tente novamente.", "error");
    }
});