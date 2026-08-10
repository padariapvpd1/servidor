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
        throw new Error("Nominatim HTTP " + resposta.status);
    }

    return await resposta.json();
}

// ========================================
// HISTÓRICO
// ========================================

function registrarComando(deviceId, command, detalhes = "") {
    historicoComandos.unshift({
        deviceId,
        command,
        detalhes,
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
            deviceId,

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

            ip,

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
        console.log(
            "Localização:",
            dispositivo.latitude,
            dispositivo.longitude
        );
        console.log("========================================");
        console.log("");

        res.json({
            sucesso: true,
            deviceId
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
        comandosPendentes.set(deviceId, []);
    }

    const comando = {
        command,
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
        console.log(
            "Título:",
            titulo || "Nova notificação"
        );

        console.log(
            "Mensagem:",
            mensagem
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
        comando
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
            response,
            recebidoEm: new Date().toISOString()
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
    padding: 20px;
    background: #111;
    color: #fff;
    font-family: Arial, sans-serif;
}

h1 {
    margin-bottom: 25px;
}

.cards {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
}

.card {
    background: #1d1d1d;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 20px;
    min-width: 180px;
}

.card-title {
    color: #aaa;
    font-size: 14px;
}

.card-value {
    font-size: 32px;
    margin-top: 8px;
}

#devices {
    margin-top: 30px;
}

.device {
    background: #1d1d1d;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 15px;
}

.device h2 {
    margin-top: 0;
}

.online {
    color: #00ff88;
    font-weight: bold;
}

.offline {
    color: #ff5555;
    font-weight: bold;
}

.info {
    margin-top: 8px;
    color: #ccc;
}

.empty {
    background: #1d1d1d;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 20px;
    color: #aaa;
}

button {
    margin-top: 15px;
    padding: 10px 15px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
}

</style>

</head>

<body>

<h1>MASTER CONTROL</h1>

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

<h2>Dispositivos</h2>

<div id="devices">

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

function escaparHTML(valor) {

    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function atualizarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices?t=" +
                Date.now(),
                {
                    cache: "no-store"
                }
            );

        if (!resposta.ok) {
            throw new Error(
                "HTTP " + resposta.status
            );
        }

        const dados =
            await resposta.json();

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
                "devices"
            );

        if (lista.length === 0) {

            container.innerHTML = \`
                <div class="empty">
                    Nenhum dispositivo conectado.
                </div>
            \`;

            return;
        }

        container.innerHTML =
            lista.map(dispositivo => {

                const statusClass =
                    dispositivo.status === "ONLINE"
                        ? "online"
                        : "offline";

                const bateria =
                    dispositivo.bateria !== null
                        ? dispositivo.bateria + "%"
                        : "N/A";

                const carregando =
                    dispositivo.carregando === true
                        ? "Sim"
                        : dispositivo.carregando === false
                            ? "Não"
                            : "N/A";

                const localizacao =
                    dispositivo.latitude !== null &&
                    dispositivo.longitude !== null
                        ? dispositivo.latitude +
                          ", " +
                          dispositivo.longitude
                        : "Indisponível";

                const endereco =
                    dispositivo.endereco ||
                    "Endereço não disponível";

                return \`
                    <div class="device">

                        <h2>
                            \${escaparHTML(
                                dispositivo.deviceId
                            )}
                        </h2>

                        <div class="\${statusClass}">
                            \${escaparHTML(
                                dispositivo.status
                            )}
                        </div>

                        <div class="info">
                            Modelo:
                            \${escaparHTML(
                                dispositivo.modelo
                            )}
                        </div>

                        <div class="info">
                            Android:
                            \${escaparHTML(
                                dispositivo.android
                            )}
                        </div>

                        <div class="info">
                            Bateria:
                            \${escaparHTML(
                                bateria
                            )}
                        </div>

                        <div class="info">
                            Carregando:
                            \${escaparHTML(
                                carregando
                            )}
                        </div>

                        <div class="info">
                            Localização:
                            \${escaparHTML(
                                localizacao
                            )}
                        </div>

                        <div class="info">
                            Endereço:
                            \${escaparHTML(
                                endereco
                            )}
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

            container.innerHTML = \`
                <div class="empty">
                    Nenhum comando registrado.
                </div>
            \`;

            return;
        }

        container.innerHTML =
            lista
                .slice(0, 50)
                .map(item => \`

                    <div class="device">

                        <strong>
                            \${escaparHTML(
                                item.command
                            )}
                        </strong>

                        <div class="info">
                            Dispositivo:
                            \${escaparHTML(
                                item.deviceId
                            )}
                        </div>

                        <div class="info">
                            \${escaparHTML(
                                item.detalhes
                            )}
                        </div>

                    </div>

                \`)
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