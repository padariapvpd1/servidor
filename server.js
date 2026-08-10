const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ========================================
// MEMÓRIA
// ========================================

const comandosPendentes = new Map();
const respostasDispositivos = new Map();
const dispositivos = new Map();
const historicoComandos = [];

// ========================================
// BUSCAR ENDEREÇO
// ========================================

async function buscarEndereco(latitude, longitude) {
    const url =
        "https://nominatim.openstreetmap.org/reverse" +
        "?format=jsonv2" +
        "&lat=" + encodeURIComponent(latitude) +
        "&lon=" + encodeURIComponent(longitude) +
        "&zoom=18" +
        "&addressdetails=1";

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "MasterControl/1.0"
        }
    });

    if (!resposta.ok) {
        throw new Error(
            "Nominatim HTTP " + resposta.status
        );
    }

    return await resposta.json();
}

// ========================================
// ESCAPAR HTML
// ========================================

function escapar(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========================================
// HISTÓRICO
// ========================================

function registrarComando(
    deviceId,
    command,
    detalhes = ""
) {
    historicoComandos.unshift({
        deviceId: deviceId,
        command: command,
        detalhes: detalhes,
        criadoEm: new Date().toISOString()
    });

    if (historicoComandos.length > 500) {
        historicoComandos.pop();
    }
}

// ========================================
// RECEBER DISPOSITIVO
// ========================================

app.post("/api/device", async (req, res) => {
    try {
        const dados = req.body || {};

        let ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "Desconhecido";

        if (
            typeof ip === "string" &&
            ip.includes(",")
        ) {
            ip = ip.split(",")[0].trim();
        }

        ip = String(ip).replace("::ffff:", "");

        const deviceId =
            dados.deviceId ||
            dados.id ||
            "dispositivo-" + ip;

        const anterior =
            dispositivos.get(deviceId);

        const dispositivo = {
            deviceId: deviceId,

            marca:
                dados.marca ||
                anterior?.marca ||
                "",

            fabricante:
                dados.fabricante ||
                anterior?.fabricante ||
                "",

            modelo:
                dados.modelo ||
                anterior?.modelo ||
                "",

            android:
                dados.android ||
                anterior?.android ||
                "",

            ip: ip,

            bateria:
                typeof dados.bateria === "number"
                    ? dados.bateria
                    : anterior?.bateria ?? null,

            carregando:
                typeof dados.carregando === "boolean"
                    ? dados.carregando
                    : anterior?.carregando ?? null,

            latitude:
                typeof dados.latitude === "number"
                    ? dados.latitude
                    : anterior?.latitude ?? null,

            longitude:
                typeof dados.longitude === "number"
                    ? dados.longitude
                    : anterior?.longitude ?? null,

            bairro:
                dados.bairro ||
                anterior?.bairro ||
                "",

            cidade:
                dados.cidade ||
                anterior?.cidade ||
                "",

            estado:
                dados.estado ||
                anterior?.estado ||
                "",

            cep:
                dados.cep ||
                anterior?.cep ||
                "",

            pais:
                dados.pais ||
                anterior?.pais ||
                "",

            endereco:
                dados.endereco ||
                anterior?.endereco ||
                "",

            localizacaoDisponivel:
                typeof dados.localizacaoDisponivel === "boolean"
                    ? dados.localizacaoDisponivel
                    : anterior?.localizacaoDisponivel ?? true,

            revogado:
                anterior?.revogado || false,

            primeiroContato:
                anterior?.primeiroContato ||
                new Date().toISOString(),

            ultimoContato:
                new Date().toISOString()
        };

        dispositivos.set(
            deviceId,
            dispositivo
        );

        // ========================================
        // BUSCAR ENDEREÇO COMPLETO
        // ========================================

        if (
            typeof dispositivo.latitude === "number" &&
            typeof dispositivo.longitude === "number" &&
            dispositivo.localizacaoDisponivel !== false
        ) {
            try {
                const endereco =
                    await buscarEndereco(
                        dispositivo.latitude,
                        dispositivo.longitude
                    );

                const address =
                    endereco.address || {};

                const atual =
                    dispositivos.get(deviceId);

                if (atual) {
                    atual.bairro =
                        address.suburb ||
                        address.neighbourhood ||
                        address.village ||
                        address.hamlet ||
                        atual.bairro ||
                        "";

                    atual.cidade =
                        address.city ||
                        address.town ||
                        address.municipality ||
                        address.village ||
                        atual.cidade ||
                        "";

                    atual.estado =
                        address.state ||
                        address.state_district ||
                        atual.estado ||
                        "";

                    atual.cep =
                        address.postcode ||
                        atual.cep ||
                        "";

                    atual.pais =
                        address.country ||
                        atual.pais ||
                        "";

                    atual.endereco =
                        endereco.display_name ||
                        atual.endereco ||
                        "";

                    dispositivos.set(
                        deviceId,
                        atual
                    );
                }
            } catch (erro) {
                console.error(
                    "Erro ao buscar endereço:",
                    erro.message
                );
            }
        }

        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "       DISPOSITIVO CONECTADO"
        );
        console.log(
            "========================================"
        );
        console.log("ID:", deviceId);
        console.log(
            "Modelo:",
            dispositivo.modelo
        );
        console.log(
            "Android:",
            dispositivo.android
        );
        console.log(
            "Bateria:",
            dispositivo.bateria
        );
        console.log(
            "Localização:",
            dispositivo.latitude,
            dispositivo.longitude
        );
        console.log(
            "Endereço:",
            dispositivo.endereco
        );
        console.log(
            "========================================"
        );
        console.log("");

        res.json({
            sucesso: true,
            deviceId: deviceId
        });

    } catch (erro) {
        console.error(
            "Erro ao receber dispositivo:",
            erro
        );

        res.status(500).json({
            sucesso: false,
            erro: "Erro interno do servidor"
        });
    }
});

// ========================================
// ENVIAR COMANDO
// ========================================

app.post("/api/command", (req, res) => {
    const {
        deviceId,
        command,
        titulo,
        mensagem,
        som,
        vibrar
    } = req.body || {};

    if (!deviceId || !command) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId e command são obrigatórios"
        });
    }

    const comandosPermitidos = [
        "STATUS",
        "MESSAGE",
        "NOTIFICATION"
    ];

    if (
        !comandosPermitidos.includes(command)
    ) {
        return res.status(400).json({
            sucesso: false,
            erro: "Comando não permitido"
        });
    }

    const dispositivo =
        dispositivos.get(deviceId);

    if (!dispositivo) {
        return res.status(404).json({
            sucesso: false,
            erro: "Dispositivo não encontrado"
        });
    }

    if (dispositivo.revogado) {
        return res.status(403).json({
            sucesso: false,
            erro: "Dispositivo revogado"
        });
    }

    if (
        command === "NOTIFICATION" &&
        (!mensagem || !mensagem.trim())
    ) {
        return res.status(400).json({
            sucesso: false,
            erro: "A mensagem é obrigatória"
        });
    }

    if (!comandosPendentes.has(deviceId)) {
        comandosPendentes.set(
            deviceId,
            []
        );
    }

    const comando = {
        command: command,
        titulo: titulo || "",
        mensagem: mensagem || "",
        som:
            typeof som === "boolean"
                ? som
                : true,
        vibrar:
            typeof vibrar === "boolean"
                ? vibrar
                : true,
        criadoEm:
            new Date().toISOString()
    };

    comandosPendentes
        .get(deviceId)
        .push(comando);

    let detalhes = "";

    if (command === "NOTIFICATION") {
        detalhes =
            "Título: " +
            (titulo || "Nova mensagem") +
            " | Mensagem: " +
            mensagem;
    } else {
        detalhes =
            mensagem || "";
    }

    registrarComando(
        deviceId,
        command,
        detalhes
    );

    console.log("");
    console.log(
        "========================================"
    );
    console.log(
        "          NOVO COMANDO"
    );
    console.log(
        "========================================"
    );
    console.log(
        "Dispositivo:",
        deviceId
    );
    console.log(
        "Comando:",
        command
    );

    if (command === "NOTIFICATION") {
        console.log(
            "Título:",
            titulo || "Nova mensagem"
        );

        console.log(
            "Mensagem:",
            mensagem
        );

        console.log(
            "Som:",
            comando.som
        );

        console.log(
            "Vibração:",
            comando.vibrar
        );
    }

    console.log(
        "========================================"
    );
    console.log("");

    res.json({
        sucesso: true,
        mensagem:
            "Comando colocado na fila"
    });
});

// ========================================
// ANDROID BUSCA COMANDO
// ========================================

app.get(
    "/api/command/:deviceId",
    (req, res) => {
        const deviceId =
            req.params.deviceId;

        const dispositivo =
            dispositivos.get(deviceId);

        if (!dispositivo) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    "Dispositivo não encontrado"
            });
        }

        if (dispositivo.revogado) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    "Dispositivo revogado",
                comando: null
            });
        }

        const fila =
            comandosPendentes.get(deviceId) ||
            [];

        if (fila.length === 0) {
            return res.json({
                sucesso: true,
                comando: null
            });
        }

        const comando =
            fila.shift();

        res.json({
            sucesso: true,
            comando: comando
        });
    }
);

// ========================================
// RECEBER RESPOSTA
// ========================================

app.post(
    "/api/response",
    (req, res) => {
        const {
            deviceId,
            response
        } = req.body || {};

        if (
            !deviceId ||
            response === undefined
        ) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    "deviceId e response são obrigatórios"
            });
        }

        respostasDispositivos.set(
            deviceId,
            {
                response: response,
                recebidoEm:
                    new Date().toISOString()
            }
        );

        const dispositivo =
            dispositivos.get(deviceId);

        if (dispositivo) {
            dispositivo.ultimoContato =
                new Date().toISOString();

            dispositivos.set(
                deviceId,
                dispositivo
            );
        }

        console.log(
            "Resposta:",
            deviceId,
            response
        );

        res.json({
            sucesso: true
        });
    }
);

// ========================================
// LISTAR DISPOSITIVOS
// ========================================

app.get(
    "/api/devices",
    (req, res) => {
        const agora =
            Date.now();

        const lista =
            Array.from(
                dispositivos.values()
            ).map(dispositivo => {

                const ultimoContato =
                    new Date(
                        dispositivo.ultimoContato
                    ).getTime();

                const segundos =
                    (
                        agora -
                        ultimoContato
                    ) / 1000;

                return {
                    ...dispositivo,

                    status:
                        segundos <= 30 &&
                        !dispositivo.revogado
                            ? "ONLINE"
                            : "OFFLINE"
                };
            });

        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        );

        res.json({
            sucesso: true,
            dispositivos: lista
        });
    }
);

// ========================================
// ÚLTIMA RESPOSTA
// ========================================

app.get(
    "/api/response/:deviceId",
    (req, res) => {
        const resposta =
            respostasDispositivos.get(
                req.params.deviceId
            );

        res.json({
            sucesso: true,
            resposta:
                resposta || null
        });
    }
);

// ========================================
// HISTÓRICO
// ========================================

app.get(
    "/api/history",
    (req, res) => {
        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        );

        res.json({
            sucesso: true,
            historico:
                historicoComandos
        });
    }
);

// ========================================
// REVOGAR
// ========================================

app.post(
    "/api/device/revoke",
    (req, res) => {
        const { deviceId } =
            req.body || {};

        if (!deviceId) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    "deviceId é obrigatório"
            });
        }

        const dispositivo =
            dispositivos.get(deviceId);

        if (!dispositivo) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    "Dispositivo não encontrado"
            });
        }

        dispositivo.revogado = true;

        dispositivos.set(
            deviceId,
            dispositivo
        );

        comandosPendentes.delete(
            deviceId
        );

        registrarComando(
            deviceId,
            "REVOKE",
            "Dispositivo revogado"
        );

        res.json({
            sucesso: true,
            mensagem:
                "Dispositivo revogado"
        });
    }
);

// ========================================
// REATIVAR
// ========================================

app.post(
    "/api/device/unrevoke",
    (req, res) => {
        const { deviceId } =
            req.body || {};

        if (!deviceId) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    "deviceId é obrigatório"
            });
        }

        const dispositivo =
            dispositivos.get(deviceId);

        if (!dispositivo) {
            return res.status(404).json({
                sucesso: false,
                erro:
                    "Dispositivo não encontrado"
            });
        }

        dispositivo.revogado = false;

        dispositivos.set(
            deviceId,
            dispositivo
        );

        registrarComando(
            deviceId,
            "UNREVOKE",
            "Dispositivo reativado"
        );

        res.json({
            sucesso: true,
            mensagem:
                "Dispositivo reativado"
        });
    }
);

// ========================================
// PAINEL
// ========================================

app.get("/", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>MASTER CONTROL</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    background: #0b0f14;
    color: #ffffff;
    font-family: Arial, sans-serif;
}

header {
    background: #111820;
    border-bottom: 1px solid #26303a;
    padding: 20px;
}

header h1 {
    margin: 0;
    font-size: 24px;
    letter-spacing: 2px;
}

header p {
    color: #8b98a5;
    margin: 6px 0 0;
}

.container {
    max-width: 1200px;
    margin: auto;
    padding: 20px;
}

.tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.tab {
    background: #151c24;
    color: #9aa7b3;
    border: 1px solid #26303a;
    padding: 12px 18px;
    border-radius: 8px;
    cursor: pointer;
}

.tab.active {
    background: #1d2731;
    color: #ffffff;
    border-color: #3b4957;
}

.section {
    display: none;
}

.section.active {
    display: block;
}

.cards {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
}

.card {
    background: #111820;
    border: 1px solid #26303a;
    border-radius: 10px;
    padding: 20px;
}

.card-title {
    color: #8b98a5;
    font-size: 13px;
    text-transform: uppercase;
}

.card-value {
    font-size: 32px;
    margin-top: 8px;
}

.device {
    background: #111820;
    border: 1px solid #26303a;
    border-radius: 10px;
    padding: 18px;
    margin-bottom: 12px;
}

.device-title {
    font-size: 18px;
    font-weight: bold;
}

.online {
    color: #4ade80;
}

.offline {
    color: #f87171;
}

.address {
    color: #aeb8c2;
    margin-top: 8px;
}

.history {
    background: #111820;
    border: 1px solid #26303a;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 10px;
}

.history-title {
    font-weight: bold;
    margin-bottom: 6px;
}

.history-message {
    color: #aeb8c2;
}

.form {
    background: #111820;
    border: 1px solid #26303a;
    border-radius: 10px;
    padding: 20px;
}

label {
    display: block;
    margin-top: 12px;
    margin-bottom: 6px;
    color: #9aa7b3;
}

input,
textarea,
select {
    width: 100%;
    background: #0b0f14;
    color: #ffffff;
    border: 1px solid #303b46;
    border-radius: 7px;
    padding: 12px;
    outline: none;
}

textarea {
    min-height: 120px;
    resize: vertical;
}

.check {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 15px;
}

.check input {
    width: auto;
}

button.send {
    margin-top: 18px;
    width: 100%;
    padding: 13px;
    background: #ffffff;
    color: #0b0f14;
    border: 0;
    border-radius: 7px;
    font-weight: bold;
    cursor: pointer;
}

.empty {
    background: #111820;
    border: 1px solid #26303a;
    border-radius: 10px;
    padding: 25px;
    color: #8b98a5;
    text-align: center;
}

.status {
    margin-top: 12px;
    padding: 10px;
    border-radius: 7px;
    background: #151c24;
    color: #8b98a5;
}

</style>

</head>

<body>

<header>

<h1>MASTER CONTROL</h1>

<p>
Sistema de monitoramento e controle
</p>

</header>

<div class="container">

<div class="tabs">

<button
    class="tab active"
    onclick="abrirAba('dispositivos', this)"
>
    Dispositivos
</button>

<button
    class="tab"
    onclick="abrirAba('notificacoes', this)"
>
    Notificações
</button>

<button
    class="tab"
    onclick="abrirAba('historico', this)"
>
    Histórico
</button>

</div>

<!-- ================================= -->
<!-- DISPOSITIVOS -->
<!-- ================================= -->

<div
    id="dispositivos"
    class="section active"
>

<div class="cards">

<div class="card">

<div class="card-title">
Dispositivos
</div>

<div
    class="card-value"
    id="total"
>
0
</div>

</div>

<div class="card">

<div class="card-title">
Online
</div>

<div
    class="card-value"
    id="online"
>
0
</div>

</div>

<div class="card">

<div class="card-title">
Offline
</div>

<div
    class="card-value"
    id="offline"
>
0
</div>

</div>

</div>

<div id="listaDispositivos">
    <div class="empty">
        Procurando dispositivos...
    </div>
</div>

</div>

<!-- ================================= -->
<!-- NOTIFICAÇÕES -->
<!-- ================================= -->

<div
    id="notificacoes"
    class="section"
>

<div class="form">

<h2>
Enviar notificação
</h2>

<label>
Dispositivo
</label>

<select id="deviceSelect">
<option value="">
Selecione um dispositivo
</option>
</select>

<label>
Título
</label>

<input
    id="titulo"
    type="text"
    placeholder="Título da notificação"
>

<label>
Mensagem
</label>

<textarea
    id="mensagem"
    placeholder="Digite a mensagem personalizada..."
></textarea>

<div class="check">

<input
    id="som"
    type="checkbox"
    checked
>

<label
    for="som"
    style="margin:0"
>
Alerta sonoro
</label>

</div>

<div class="check">

<input
    id="vibrar"
    type="checkbox"
    checked
>

<label
    for="vibrar"
    style="margin:0"
>
Vibração
</label>

</div>

<button
    class="send"
    onclick="enviarNotificacao()"
>
ENVIAR NOTIFICAÇÃO
</button>

<div
    id="resultado"
    class="status"
>
Aguardando envio.
</div>

</div>

</div>

<!-- ================================= -->
<!-- HISTÓRICO -->
<!-- ================================= -->

<div
    id="historico"
    class="section"
>

<div id="listaHistorico">

<div class="empty">
Carregando histórico...
</div>

</div>

</div>

</div>

<script>

function abrirAba(nome, botao) {

    document
        .querySelectorAll(".section")
        .forEach(secao => {
            secao.classList.remove("active");
        });

    document
        .querySelectorAll(".tab")
        .forEach(tab => {
            tab.classList.remove("active");
        });

    document
        .getElementById(nome)
        .classList.add("active");

    botao.classList.add("active");
}

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?x=" +
                Date.now()
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {
            return;
        }

        const lista =
            dados.dispositivos || [];

        document.getElementById(
            "total"
        ).textContent = lista.length;

        document.getElementById(
            "online"
        ).textContent =
            lista.filter(
                d => d.status === "ONLINE"
            ).length;

        document.getElementById(
            "offline"
        ).textContent =
            lista.filter(
                d => d.status === "OFFLINE"
            ).length;

        const container =
            document.getElementById(
                "listaDispositivos"
            );

        const select =
            document.getElementById(
                "deviceSelect"
            );

        const valorAtual =
            select.value;

        select.innerHTML =
            '<option value="">Selecione um dispositivo</option>';

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">Nenhum dispositivo encontrado.</div>';

            return;
        }

        container.innerHTML = "";

        lista.forEach(dispositivo => {

            const div =
                document.createElement(
                    "div"
                );

            div.className = "device";

            const endereco =
                dispositivo.endereco ||
                [
                    dispositivo.bairro,
                    dispositivo.cidade,
                    dispositivo.estado,
                    dispositivo.cep,
                    dispositivo.pais
                ]
                .filter(Boolean)
                .join(", ");

            div.innerHTML =

                '<div class="device-title">' +
                escapeHtml(
                    dispositivo.modelo ||
                    dispositivo.deviceId
                ) +
                '</div>' +

                '<div>' +
                escapeHtml(
                    dispositivo.deviceId
                ) +
                '</div>' +

                '<div class="' +
                (
                    dispositivo.status === "ONLINE"
                        ? "online"
                        : "offline"
                ) +
                '">' +
                escapeHtml(
                    dispositivo.status
                ) +
                '</div>' +

                '<div class="address">' +
                escapeHtml(
                    endereco ||
                    "Endereço indisponível"
                ) +
                '</div>' +

                '<div class="address">' +
                'Bateria: ' +
                escapeHtml(
                    dispositivo.bateria ??
                    "?"
                ) +
                '% | Android: ' +
                escapeHtml(
                    dispositivo.android ||
                    "?"
                ) +
                '</div>';

            container.appendChild(div);

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                dispositivo.deviceId;

            option.textContent =
                (
                    dispositivo.modelo ||
                    dispositivo.deviceId
                ) +
                " - " +
                dispositivo.status;

            select.appendChild(option);
        });

        if (
            lista.some(
                d =>
                    d.deviceId === valorAtual
            )
        ) {
            select.value =
                valorAtual;
        }

    } catch (erro) {

        console.error(
            "Erro ao carregar dispositivos:",
            erro
        );
    }
}

async function enviarNotificacao() {

    const deviceId =
        document.getElementById(
            "deviceSelect"
        ).value;

    const titulo =
        document.getElementById(
            "titulo"
        ).value;

    const mensagem =
        document.getElementById(
            "mensagem"
        ).value;

    const som =
        document.getElementById(
            "som"
        ).checked;

    const vibrar =
        document.getElementById(
            "vibrar"
        ).checked;

    const resultado =
        document.getElementById(
            "resultado"
        );

    if (!deviceId) {

        resultado.textContent =
            "Selecione um dispositivo.";

        return;
    }

    if (!mensagem.trim()) {

        resultado.textContent =
            "Digite uma mensagem.";

        return;
    }

    resultado.textContent =
        "Enviando...";

    try {

        const resposta =
            await fetch(
                "/api/command",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        deviceId:
                            deviceId,

                        command:
                            "NOTIFICATION",

                        titulo:
                            titulo,

                        mensagem:
                            mensagem,

                        som:
                            som,

                        vibrar:
                            vibrar
                    })
                }
            );

        const dados =
            await resposta.json();

        if (dados.sucesso) {

            resultado.textContent =
                "Notificação colocada na fila com sucesso.";

            document.getElementById(
                "mensagem"
            ).value = "";

        } else {

            resultado.textContent =
                dados.erro ||
                "Erro ao enviar.";
        }

        carregarHistorico();

    } catch (erro) {

        console.error(erro);

        resultado.textContent =
            "Erro de conexão com o servidor.";
    }
}

async function carregarHistorico() {

    try {

        const resposta =
            await fetch(
                "/api/history?x=" +
                Date.now()
            );

        const dados =
            await resposta.json();

        const container =
            document.getElementById(
                "listaHistorico"
            );

        const lista =
            dados.historico || [];

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">Nenhuma mensagem enviada.</div>';

            return;
        }

        container.innerHTML = "";

        lista.forEach(item => {

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "history";

            const data =
                new Date(
                    item.criadoEm
                ).toLocaleString(
                    "pt-BR"
                );

            div.innerHTML =

                '<div class="history-title">' +
                escapeHtml(
                    item.command
                ) +
                '</div>' +

                '<div>' +
                escapeHtml(
                    item.deviceId
                ) +
                '</div>' +

                '<div class="history-message">' +
                escapeHtml(
                    item.detalhes
                ) +
                '</div>' +

                '<div class="history-message">' +
                escapeHtml(
                    data
                ) +
                '</div>';

            container.appendChild(div);
        });

    } catch (erro) {

        console.error(
            "Erro ao carregar histórico:",
            erro
        );
    }
}

function escapeHtml(valor) {

    return String(
        valor ?? ""
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

carregarDispositivos();

carregarHistorico();

setInterval(
    carregarDispositivos,
    2000
);

setInterval(
    carregarHistorico,
    3000
);

</script>

</body>

</html>
    `);
});

// ========================================
// HEALTH CHECK
// ========================================

app.get(
    "/health",
    (req, res) => {

        res.set(
            "Cache-Control",
            "no-store"
        );

        res.json({
            sucesso: true,
            servidor:
                "MASTER CONTROL",
            status: "ONLINE",
            dispositivos:
                dispositivos.size,
            hora:
                new Date().toISOString()
        });
    }
);

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "========================================"
        );
        console.log(
            "          MASTER CONTROL"
        );
        console.log(
            "========================================"
        );
        console.log(
            "Servidor iniciado"
        );
        console.log(
            "Porta:",
            PORT
        );
        console.log(
            "Painel: /"
        );
        console.log(
            "Health: /health"
        );
        console.log(
            "Notificações: ATIVADAS"
        );
        console.log(
            "Som: ATIVADO"
        );
        console.log(
            "Vibração: ATIVADA"
        );
        console.log(
            "Histórico: ATIVADO"
        );
        console.log(
            "Atualização: 2 segundos"
        );
        console.log(
            "Aguardando dispositivos..."
        );
        console.log("");
    }
);