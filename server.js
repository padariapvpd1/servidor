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
        // BUSCAR ENDEREÇO
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
        console.log("========================================");
        console.log("       DISPOSITIVO CONECTADO");
        console.log("========================================");
        console.log("ID:", deviceId);
        console.log("Modelo:", dispositivo.modelo);
        console.log("Android:", dispositivo.android);
        console.log("Bateria:", dispositivo.bateria);
        console.log(
            "Localização:",
            dispositivo.latitude,
            dispositivo.longitude
        );
        console.log("========================================");
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

    if (!comandosPermitidos.includes(command)) {
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
            (titulo || "Nova notificação") +
            " | Mensagem: " +
            mensagem +
            " | Som: " +
            (comando.som ? "SIM" : "NÃO") +
            " | Vibração: " +
            (comando.vibrar ? "SIM" : "NÃO");
    } else {
        detalhes = mensagem || "";
    }

    registrarComando(
        deviceId,
        command,
        detalhes
    );

    console.log("");
    console.log("========================================");
    console.log("          NOVO COMANDO");
    console.log("========================================");
    console.log("Dispositivo:", deviceId);
    console.log("Comando:", command);

    if (command === "NOTIFICATION") {
        console.log(
            "Título:",
            titulo || "Nova notificação"
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

    console.log("========================================");
    console.log("");

    res.json({
        sucesso: true,
        mensagem: "Comando colocado na fila"
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
                erro: "Dispositivo não encontrado"
            });
        }

        if (dispositivo.revogado) {
            return res.status(403).json({
                sucesso: false,
                erro: "Dispositivo revogado",
                comando: null
            });
        }

        const fila =
            comandosPendentes.get(deviceId) || [];

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

app.post("/api/response", (req, res) => {
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
});

// ========================================
// LISTAR DISPOSITIVOS
// ========================================

app.get("/api/devices", (req, res) => {
    const agora = Date.now();

    const lista =
        Array.from(
            dispositivos.values()
        ).map(dispositivo => {

            const ultimoContato =
                new Date(
                    dispositivo.ultimoContato
                ).getTime();

            const segundos =
                (agora - ultimoContato) / 1000;

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
});

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
            resposta: resposta || null
        });
    }
);

// ========================================
// HISTÓRICO
// ========================================

app.get("/api/history", (req, res) => {
    res.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    res.json({
        sucesso: true,
        historico: historicoComandos
    });
});

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
    font-family: Arial, Helvetica, sans-serif;
}

.header {
    background: #111720;
    border-bottom: 1px solid #26303d;
    padding: 20px;
}

.header h1 {
    margin: 0;
    font-size: 24px;
    letter-spacing: 2px;
}

.header p {
    margin: 7px 0 0;
    color: #8994a3;
}

.container {
    max-width: 1200px;
    margin: auto;
    padding: 20px;
}

.tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.tab {
    background: #151c25;
    border: 1px solid #2a3543;
    color: #aeb8c5;
    padding: 12px 18px;
    border-radius: 8px;
    cursor: pointer;
}

.tab.active {
    background: #202a36;
    color: #ffffff;
    border-color: #4b5969;
}

.page {
    display: none;
}

.page.active {
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
    background: #111720;
    border: 1px solid #26303d;
    border-radius: 10px;
    padding: 20px;
}

.card-title {
    color: #8994a3;
    font-size: 13px;
    margin-bottom: 10px;
}

.card-value {
    font-size: 30px;
    font-weight: bold;
}

.panel {
    background: #111720;
    border: 1px solid #26303d;
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
}

.panel-title {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 18px;
}

label {
    display: block;
    color: #9ca8b7;
    font-size: 13px;
    margin-bottom: 7px;
}

input,
textarea,
select {
    width: 100%;
    background: #0b0f14;
    color: #ffffff;
    border: 1px solid #303b49;
    border-radius: 7px;
    padding: 12px;
    margin-bottom: 15px;
    outline: none;
}

textarea {
    min-height: 120px;
    resize: vertical;
}

input:focus,
textarea:focus,
select:focus {
    border-color: #657487;
}

.checks {
    display: flex;
    gap: 25px;
    margin: 5px 0 18px;
    flex-wrap: wrap;
}

.check {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #c2cad4;
}

.check input {
    width: auto;
    margin: 0;
}

button {
    background: #ffffff;
    color: #0b0f14;
    border: none;
    border-radius: 7px;
    padding: 12px 20px;
    font-weight: bold;
    cursor: pointer;
}

button:hover {
    opacity: 0.85;
}

.device {
    background: #0d131b;
    border: 1px solid #26303d;
    border-radius: 9px;
    padding: 16px;
    margin-bottom: 12px;
}

.device-header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}

.device-id {
    font-weight: bold;
    font-size: 17px;
}

.online {
    color: #6ee7a0;
}

.offline {
    color: #f08b8b;
}

.device-info {
    color: #929dac;
    margin-top: 10px;
    line-height: 1.7;
}

.history-item {
    border-bottom: 1px solid #26303d;
    padding: 15px 0;
}

.history-item:last-child {
    border-bottom: none;
}

.history-command {
    font-weight: bold;
    margin-bottom: 6px;
}

.history-details {
    color: #a5afbc;
    line-height: 1.5;
}

.history-date {
    color: #697585;
    font-size: 12px;
    margin-top: 7px;
}

.empty {
    text-align: center;
    color: #687483;
    padding: 35px;
}

.status-message {
    margin-top: 15px;
    color: #8fdbad;
}

</style>

</head>

<body>

<div class="header">

    <h1>MASTER CONTROL</h1>

    <p>
        Sistema de monitoramento e controle
    </p>

</div>

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
        class="page active"
    >

        <div class="cards">

            <div class="card">

                <div class="card-title">
                    DISPOSITIVOS
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
                    ONLINE
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
                    OFFLINE
                </div>

                <div
                    class="card-value"
                    id="offline"
                >
                    0
                </div>

            </div>

        </div>

        <div class="panel">

            <div class="panel-title">
                Dispositivos conectados
            </div>

            <div id="listaDispositivos">
                <div class="empty">
                    Procurando dispositivos...
                </div>
            </div>

        </div>

    </div>

    <!-- ================================= -->
    <!-- NOTIFICAÇÕES -->
    <!-- ================================= -->

    <div
        id="notificacoes"
        class="page"
    >

        <div class="panel">

            <div class="panel-title">
                Enviar notificação
            </div>

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
                Mensagem personalizada
            </label>

            <textarea
                id="mensagem"
                placeholder="Digite a mensagem..."
            ></textarea>

            <div class="checks">

                <label class="check">

                    <input
                        id="som"
                        type="checkbox"
                        checked
                    >

                    Alerta sonoro

                </label>

                <label class="check">

                    <input
                        id="vibrar"
                        type="checkbox"
                        checked
                    >

                    Vibração

                </label>

            </div>

            <button
                onclick="enviarNotificacao()"
            >
                ENVIAR NOTIFICAÇÃO
            </button>

            <div
                id="statusEnvio"
                class="status-message"
            ></div>

        </div>

    </div>

    <!-- ================================= -->
    <!-- HISTÓRICO -->
    <!-- ================================= -->

    <div
        id="historico"
        class="page"
    >

        <div class="panel">

            <div class="panel-title">
                Histórico de mensagens
            </div>

            <div id="listaHistorico">

                <div class="empty">
                    Carregando histórico...
                </div>

            </div>

        </div>

    </div>

</div>

<script>

function abrirAba(nome, botao) {

    document
        .querySelectorAll(".page")
        .forEach(function(page) {
            page.classList.remove("active");
        });

    document
        .querySelectorAll(".tab")
        .forEach(function(tab) {
            tab.classList.remove("active");
        });

    document
        .getElementById(nome)
        .classList.add("active");

    botao.classList.add("active");

    if (nome === "historico") {
        carregarHistorico();
    }

    if (nome === "notificacoes") {
        carregarDispositivosSelect();
    }
}

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?ts=" +
                Date.now(),
                {
                    cache: "no-store"
                }
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
            lista.filter(function(d) {
                return d.status === "ONLINE";
            }).length;

        document.getElementById(
            "offline"
        ).textContent =
            lista.filter(function(d) {
                return d.status === "OFFLINE";
            }).length;

        const container =
            document.getElementById(
                "listaDispositivos"
            );

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Procurando dispositivos...' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista.map(function(d) {

                const classe =
                    d.status === "ONLINE"
                        ? "online"
                        : "offline";

                return (
                    '<div class="device">' +

                        '<div class="device-header">' +

                            '<div class="device-id">' +
                                escapeHtml(
                                    d.deviceId
                                ) +
                            '</div>' +

                            '<div class="' +
                                classe +
                            '">' +
                                d.status +
                            '</div>' +

                        '</div>' +

                        '<div class="device-info">' +

                            'Modelo: ' +
                            escapeHtml(
                                d.modelo || "-"
                            ) +
                            '<br>' +

                            'Android: ' +
                            escapeHtml(
                                d.android || "-"
                            ) +
                            '<br>' +

                            'Bateria: ' +
                            (
                                d.bateria !== null
                                    ? d.bateria + "%"
                                    : "-"
                            ) +
                            '<br>' +

                            'Localização: ' +
                            escapeHtml(
                                d.cidade || "-"
                            ) +
                            (
                                d.estado
                                    ? " - " +
                                      escapeHtml(
                                          d.estado
                                      )
                                    : ""
                            ) +

                        '</div>' +

                    '</div>'
                );

            }).join("");

    } catch (erro) {

        console.error(
            "Erro ao carregar dispositivos:",
            erro
        );

    }
}

async function carregarDispositivosSelect() {

    try {

        const resposta =
            await fetch(
                "/api/devices?ts=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {
            return;
        }

        const select =
            document.getElementById(
                "deviceSelect"
            );

        const atual =
            select.value;

        select.innerHTML =
            '<option value="">' +
            'Selecione um dispositivo' +
            '</option>';

        (dados.dispositivos || [])
            .forEach(function(d) {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    d.deviceId;

                option.textContent =
                    d.deviceId +
                    " - " +
                    (
                        d.modelo ||
                        "Dispositivo"
                    ) +
                    " [" +
                    d.status +
                    "]";

                select.appendChild(
                    option
                );
            });

        if (atual) {
            select.value = atual;
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
        ).value.trim();

    const mensagem =
        document.getElementById(
            "mensagem"
        ).value.trim();

    const som =
        document.getElementById(
            "som"
        ).checked;

    const vibrar =
        document.getElementById(
            "vibrar"
        ).checked;

    const status =
        document.getElementById(
            "statusEnvio"
        );

    if (!deviceId) {

        status.textContent =
            "Selecione um dispositivo.";

        return;
    }

    if (!mensagem) {

        status.textContent =
            "Digite uma mensagem.";

        return;
    }

    status.textContent =
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

        if (!resposta.ok) {

            status.textContent =
                dados.erro ||
                "Erro ao enviar.";

            return;
        }

        status.textContent =
            "Notificação colocada na fila.";

        document.getElementById(
            "mensagem"
        ).value = "";

        document.getElementById(
            "titulo"
        ).value = "";

        setTimeout(
            carregarHistorico,
            500
        );

    } catch (erro) {

        console.error(
            erro
        );

        status.textContent =
            "Erro de conexão com o servidor.";
    }
}

async function carregarHistorico() {

    const container =
        document.getElementById(
            "listaHistorico"
        );

    try {

        const resposta =
            await fetch(
                "/api/history?ts=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            dados.historico || [];

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhuma mensagem registrada.' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista
                .filter(function(item) {
                    return (
                        item.command ===
                        "NOTIFICATION"
                    );
                })
                .map(function(item) {

                    return (
                        '<div class="history-item">' +

                            '<div class="history-command">' +
                                'NOTIFICAÇÃO — ' +
                                escapeHtml(
                                    item.deviceId
                                ) +
                            '</div>' +

                            '<div class="history-details">' +
                                escapeHtml(
                                    item.detalhes
                                ) +
                            '</div>' +

                            '<div class="history-date">' +
                                formatarData(
                                    item.criadoEm
                                ) +
                            '</div>' +

                        '</div>'
                    );

                })
                .join("");

        if (!container.innerHTML) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhuma mensagem registrada.' +
                '</div>';
        }

    } catch (erro) {

        console.error(
            "Erro ao carregar histórico:",
            erro
        );

        container.innerHTML =
            '<div class="empty">' +
            'Erro ao carregar histórico.' +
            '</div>';
    }
}

function formatarData(data) {

    try {

        return new Date(
            data
        ).toLocaleString(
            "pt-BR"
        );

    } catch (_) {

        return data;
    }
}

function escapeHtml(valor) {

    return String(valor || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

carregarDispositivos();

setInterval(
    carregarDispositivos,
    2000
);

</script>

</body>

</html>
    `);

});

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", (req, res) => {

    res.set(
        "Cache-Control",
        "no-store"
    );

    res.json({
        sucesso: true,
        servidor: "MASTER CONTROL",
        status: "ONLINE",
        dispositivos:
            dispositivos.size,
        hora:
            new Date().toISOString()
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log("========================================");
        console.log("          MASTER CONTROL");
        console.log("========================================");
        console.log("Servidor iniciado");
        console.log("Porta:", PORT);
        console.log("Painel: /");
        console.log("Health: /health");
        console.log("Notificações: ATIVADAS");
        console.log("Som: ATIVADO");
        console.log("Vibração: ATIVADA");
        console.log("Histórico: ATIVADO");
        console.log("Atualização: 2 segundos");
        console.log("Aguardando dispositivos...");
        console.log("");
    }
);