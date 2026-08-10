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

function registrarComando(deviceId, command, detalhes = "") {
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

        if (typeof ip === "string" && ip.includes(",")) {
            ip = ip.split(",")[0].trim();
        }

        ip = String(ip).replace("::ffff:", "");

        const deviceId =
            dados.deviceId ||
            dados.id ||
            "dispositivo-" + ip;

        const anterior = dispositivos.get(deviceId);

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

        dispositivos.set(deviceId, dispositivo);

        // ========================================
        // BUSCAR ENDEREÇO
        // ========================================

        if (
            typeof dispositivo.latitude === "number" &&
            typeof dispositivo.longitude === "number" &&
            dispositivo.localizacaoDisponivel !== false
        ) {
            try {
                const endereco = await buscarEndereco(
                    dispositivo.latitude,
                    dispositivo.longitude
                );

                const address = endereco.address || {};

                const atual = dispositivos.get(deviceId);

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

                    dispositivos.set(deviceId, atual);
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
        console.log("Localização:", dispositivo.latitude, dispositivo.longitude);
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
        mensagem
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

    const dispositivo = dispositivos.get(deviceId);

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

    if (command === "NOTIFICATION") {
        if (!mensagem || !mensagem.trim()) {
            return res.status(400).json({
                sucesso: false,
                erro: "A mensagem é obrigatória"
            });
        }
    }

    if (!comandosPendentes.has(deviceId)) {
        comandosPendentes.set(deviceId, []);
    }

    const comando = {
        command: command,
        titulo: titulo || "",
        mensagem: mensagem || "",
        criadoEm: new Date().toISOString()
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
            mensagem;
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
        console.log("Título:", titulo || "Nova notificação");
        console.log("Mensagem:", mensagem);
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

app.get("/api/command/:deviceId", (req, res) => {
    const deviceId = req.params.deviceId;

    const dispositivo = dispositivos.get(deviceId);

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

    const comando = fila.shift();

    res.json({
        sucesso: true,
        comando: comando
    });
});

// ========================================
// RECEBER RESPOSTA
// ========================================

app.post("/api/response", (req, res) => {
    const {
        deviceId,
        response
    } = req.body || {};

    if (!deviceId || response === undefined) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId e response são obrigatórios"
        });
    }

    respostasDispositivos.set(deviceId, {
        response: response,
        recebidoEm: new Date().toISOString()
    });

    const dispositivo = dispositivos.get(deviceId);

    if (dispositivo) {
        dispositivo.ultimoContato =
            new Date().toISOString();

        dispositivos.set(deviceId, dispositivo);
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
        Array.from(dispositivos.values()).map(
            dispositivo => {

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
            }
        );

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

app.get("/api/response/:deviceId", (req, res) => {
    const resposta =
        respostasDispositivos.get(
            req.params.deviceId
        );

    res.json({
        sucesso: true,
        resposta: resposta || null
    });
});

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

app.post("/api/device/revoke", (req, res) => {
    const { deviceId } = req.body || {};

    if (!deviceId) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId é obrigatório"
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

    dispositivo.revogado = true;

    dispositivos.set(
        deviceId,
        dispositivo
    );

    comandosPendentes.delete(deviceId);

    registrarComando(
        deviceId,
        "REVOKE",
        "Dispositivo revogado"
    );

    res.json({
        sucesso: true,
        mensagem: "Dispositivo revogado"
    });
});

// ========================================
// REATIVAR
// ========================================

app.post("/api/device/unrevoke", (req, res) => {
    const { deviceId } = req.body || {};

    if (!deviceId) {
        return res.status(400).json({
            sucesso: false,
            erro: "deviceId é obrigatório"
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
        mensagem: "Dispositivo reativado"
    });
});

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
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>MASTER CONTROL</title>

<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    padding: 20px;
    background: #0f1115;
    color: #ffffff;
    font-family: Arial, sans-serif;
}

h1 {
    margin-bottom: 25px;
}

h2 {
    margin-top: 35px;
}

.dashboard {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
    gap: 15px;
}

.card {
    background: #181b21;
    border: 1px solid #292d35;
    border-radius: 12px;
    padding: 20px;
}

.card-title {
    color: #9da3ad;
    font-size: 14px;
}

.card-value {
    font-size: 30px;
    font-weight: bold;
    margin-top: 8px;
}

.device {
    background: #181b21;
    border: 1px solid #292d35;
    border-radius: 12px;
    padding: 20px;
    margin-top: 15px;
}

.device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
}

.device-name {
    font-size: 20px;
    font-weight: bold;
}

.online {
    color: #42d77d;
}

.offline {
    color: #ff6464;
}

.info {
    margin-top: 15px;
    line-height: 1.7;
    color: #c8ccd3;
}

.actions {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #292d35;
}

input {
    width: 100%;
    padding: 12px;
    margin-bottom: 10px;
    border-radius: 8px;
    border: 1px solid #333842;
    background: #101217;
    color: #ffffff;
}

button {
    border: 0;
    border-radius: 8px;
    padding: 11px 15px;
    cursor: pointer;
    background: #ffffff;
    color: #111111;
    font-weight: bold;
    margin-right: 8px;
}

button:hover {
    opacity: 0.85;
}

.notification-box {
    display: none;
    margin-top: 15px;
    padding: 15px;
    background: #101217;
    border-radius: 10px;
}

.history-item {
    background: #181b21;
    border: 1px solid #292d35;
    border-radius: 10px;
    padding: 15px;
    margin-top: 10px;
}

.empty {
    color: #888f9b;
    padding: 20px 0;
}

.location {
    margin-top: 10px;
    color: #ffffff;
}

.location strong {
    color: #8fa8ff;
}
</style>
</head>

<body>

<h1>MASTER CONTROL</h1>

<div class="dashboard">

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

<h2>Dispositivos</h2>

<div id="devicesList">
    <div class="empty">
        Procurando dispositivos...
    </div>
</div>

<h2>Histórico</h2>

<div id="historyList">
    <div class="empty">
        Nenhum comando registrado.
    </div>
</div>

<script>

function escaparJS(valor) {
    return String(valor ?? "")
        .replace(/\\\\/g, "\\\\\\\\")
        .replace(/'/g, "\\\\'")
        .replace(/"/g, "\\\"");
}

async function atualizarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?t=" + Date.now(),
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            dados.dispositivos || [];

        document.getElementById("total")
            .textContent = lista.length;

        document.getElementById("online")
            .textContent =
                lista.filter(
                    d => d.status === "ONLINE"
                ).length;

        document.getElementById("offline")
            .textContent =
                lista.filter(
                    d => d.status === "OFFLINE"
                ).length;

        const container =
            document.getElementById(
                "devicesList"
            );

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhum dispositivo conectado.' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista.map(dispositivo => {

                const id =
                    escaparJS(
                        dispositivo.deviceId
                    );

                const statusClass =
                    dispositivo.status === "ONLINE"
                        ? "online"
                        : "offline";

                const bateria =
                    dispositivo.bateria !== null
                        ? dispositivo.bateria + "%"
                        : "N/A";

                let localizacao =
                    "Localização indisponível";

                if (
                    dispositivo.endereco
                ) {
                    localizacao =
                        dispositivo.endereco;
                } else if (
                    dispositivo.cidade ||
                    dispositivo.estado
                ) {
                    localizacao =
                        [
                            dispositivo.cidade,
                            dispositivo.estado,
                            dispositivo.pais
                        ]
                        .filter(Boolean)
                        .join(", ");
                } else if (
                    typeof dispositivo.latitude ===
                        "number" &&
                    typeof dispositivo.longitude ===
                        "number"
                ) {
                    localizacao =
                        dispositivo.latitude +
                        ", " +
                        dispositivo.longitude;
                }

                return \`
<div class="device">

    <div class="device-header">

        <div class="device-name">
            \${escapar(dispositivo.modelo || dispositivo.deviceId)}
        </div>

        <div class="\${statusClass}">
            \${escapar(dispositivo.status)}
        </div>

    </div>

    <div class="info">

        <div>
            <strong>ID:</strong>
            \${escapar(dispositivo.deviceId)}
        </div>

        <div>
            <strong>Marca:</strong>
            \${escapar(dispositivo.marca || "N/A")}
        </div>

        <div>
            <strong>Android:</strong>
            \${escapar(dispositivo.android || "N/A")}
        </div>

        <div>
            <strong>Bateria:</strong>
            \${escapar(bateria)}
        </div>

        <div class="location">
            <strong>Localização:</strong><br>
            \${escapar(localizacao)}
        </div>

    </div>

    <div class="actions">

        <button
            onclick="abrirNotificacao('\${id}')"
        >
            Enviar notificação
        </button>

        <button
            onclick="enviarStatus('\${id}')"
        >
            Status
        </button>

        <div
            class="notification-box"
            id="notification-\${id}"
        >

            <input
                id="titulo-\${id}"
                type="text"
                placeholder="Título da notificação"
                maxlength="100"
            >

            <input
                id="mensagem-\${id}"
                type="text"
                placeholder="Mensagem"
                maxlength="500"
            >

            <button
                onclick="enviarNotificacao('\${id}')"
            >
                Enviar
            </button>

        </div>

    </div>

</div>
\`;

            }).join("");

    } catch (erro) {

        console.error(
            "Erro ao atualizar dispositivos:",
            erro
        );
    }
}

function abrirNotificacao(deviceId) {

    const caixa =
        document.getElementById(
            "notification-" + deviceId
        );

    if (!caixa) {
        return;
    }

    caixa.style.display =
        caixa.style.display === "block"
            ? "none"
            : "block";
}

async function enviarNotificacao(deviceId) {

    const titulo =
        document.getElementById(
            "titulo-" + deviceId
        )?.value || "";

    const mensagem =
        document.getElementById(
            "mensagem-" + deviceId
        )?.value || "";

    if (!mensagem.trim()) {

        alert(
            "Digite uma mensagem."
        );

        return;
    }

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

                    body:
                        JSON.stringify({
                            deviceId: deviceId,
                            command:
                                "NOTIFICATION",
                            titulo:
                                titulo.trim(),
                            mensagem:
                                mensagem.trim()
                        })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Erro ao enviar notificação."
            );

            return;
        }

        alert(
            "Notificação enviada para a fila."
        );

        atualizarHistorico();

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de comunicação com o servidor."
        );
    }
}

async function enviarStatus(deviceId) {

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

                    body:
                        JSON.stringify({
                            deviceId: deviceId,
                            command: "STATUS"
                        })
                }
            );

        const dados =
            await resposta.json();

        if (!dados.sucesso) {

            alert(
                dados.erro ||
                "Erro ao enviar status."
            );
        }

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de comunicação."
        );
    }
}

async function atualizarHistorico() {

    try {

        const resposta =
            await fetch(
                "/api/history?t=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            dados.historico || [];

        const container =
            document.getElementById(
                "historyList"
            );

        if (lista.length === 0) {

            container.innerHTML =
                '<div class="empty">' +
                'Nenhum comando registrado.' +
                '</div>';

            return;
        }

        container.innerHTML =
            lista
                .slice(0, 50)
                .map(item => {

                    return \`
<div class="history-item">

    <strong>
        \${escapar(item.command)}
    </strong>

    <div>
        Dispositivo:
        \${escapar(item.deviceId)}
    </div>

    <div>
        \${escapar(item.detalhes)}
    </div>

    <small>
        \${escapar(item.criadoEm)}
    </small>

</div>
\`;

                })
                .join("");

    } catch (erro) {

        console.error(
            "Erro ao atualizar histórico:",
            erro
        );
    }
}

atualizarDispositivos();
atualizarHistorico();

setInterval(
    atualizarDispositivos,
    2000
);

setInterval(
    atualizarHistorico,
    2000
);

</script>

</body>
</html>`);
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
        dispositivos: dispositivos.size,
        hora: new Date().toISOString()
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
        console.log("Atualização: 2 segundos");
        console.log("Aguardando dispositivos...");
        console.log("");
    }
);