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
        // ATUALIZAR ENDEREÇO
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

        // ========================================
        // LOG
        // ========================================

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
        console.log(
            "ID:",
            deviceId
        );
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
            erro:
                "deviceId e command são obrigatórios"
        });
    }

    const comandosPermitidos = [
        "STATUS",
        "MESSAGE",
        "NOTIFICATION",
        "LOCK_SCREEN"
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

        titulo:
            titulo || "",

        mensagem:
            mensagem || "",

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
    } else if (command === "LOCK_SCREEN") {
        detalhes =
            "Solicitação para bloquear a tela";
    } else {
        detalhes =
            mensagem || "";
    }

    registrarComando(
        deviceId,
        command,
        detalhes
    );

    // ========================================
    // LOG DO COMANDO
    // ========================================

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

    if (command === "LOCK_SCREEN") {
        console.log(
            "Ação: BLOQUEAR TELA"
        );
    }

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
            ).map(
                dispositivo => {
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
        const {
            deviceId
        } = req.body || {};

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
        const {
            deviceId
        } = req.body || {};

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

<title>Master Control</title>

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
    margin-top: 0;
}

button {
    cursor: pointer;
}

.tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.tab {
    background: #22262e;
    color: white;
    border: 0;
    padding: 12px 18px;
    border-radius: 8px;
}

.tab.active {
    background: #3b82f6;
}

.aba {
    display: none;
}

.aba.active {
    display: block;
}

.card {
    background: #191d24;
    border: 1px solid #2b3039;
    border-radius: 12px;
    padding: 18px;
    margin-bottom: 15px;
}

.online {
    color: #22c55e;
    font-weight: bold;
}

.offline {
    color: #ef4444;
    font-weight: bold;
}

input,
textarea {
    width: 100%;
    background: #111318;
    color: white;
    border: 1px solid #343944;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 10px;
}

textarea {
    min-height: 100px;
    resize: vertical;
}

.send {
    background: #3b82f6;
    color: white;
    border: 0;
    padding: 12px 18px;
    border-radius: 8px;
    font-weight: bold;
}

.lock {
    background: #dc2626;
    color: white;
    border: 0;
    padding: 12px 18px;
    border-radius: 8px;
    font-weight: bold;
    margin-top: 10px;
}

.small {
    color: #a1a1aa;
    font-size: 13px;
}

.checkbox {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
}

.checkbox input {
    width: auto;
    margin: 0;
}

</style>

</head>

<body>

<h1>Master Control</h1>

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

<!-- =====================================
     DISPOSITIVOS
===================================== -->

<div
    id="dispositivos"
    class="aba active"
>

    <div id="listaDispositivos">
        Carregando dispositivos...
    </div>

</div>

<!-- =====================================
     NOTIFICAÇÕES
===================================== -->

<div
    id="notificacoes"
    class="aba"
>

    <div class="card">

        <h2>Enviar notificação</h2>

        <input
            id="deviceNotificacao"
            type="text"
            placeholder="ID do dispositivo"
        >

        <input
            id="titulo"
            type="text"
            placeholder="Título da notificação"
        >

        <textarea
            id="mensagem"
            placeholder="Mensagem"
        ></textarea>

        <label class="checkbox">

            <input
                id="som"
                type="checkbox"
                checked
            >

            Som

        </label>

        <label class="checkbox">

            <input
                id="vibrar"
                type="checkbox"
                checked
            >

            Vibração

        </label>

        <button
            class="send"
            onclick="enviarNotificacao()"
        >
            ENVIAR NOTIFICAÇÃO
        </button>

    </div>

</div>

<!-- =====================================
     HISTÓRICO
===================================== -->

<div
    id="historico"
    class="aba"
>

    <div id="listaHistorico">
        Carregando histórico...
    </div>

</div>

<script>

function escaparJS(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ========================================
// ABAS
// ========================================

function abrirAba(nome, botao) {

    document
        .querySelectorAll(".aba")
        .forEach(function(aba) {
            aba.classList.remove("active");
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

}

// ========================================
// CARREGAR DISPOSITIVOS
// ========================================

async function carregarDispositivos() {

    try {

        const resposta =
            await fetch(
                "/api/devices",
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            document.getElementById(
                "listaDispositivos"
            );

        if (
            !dados.sucesso ||
            !Array.isArray(dados.dispositivos)
        ) {
            lista.innerHTML =
                "<p>Erro ao carregar dispositivos.</p>";

            return;
        }

        if (dados.dispositivos.length === 0) {

            lista.innerHTML =
                "<p>Nenhum dispositivo conectado.</p>";

            return;
        }

        lista.innerHTML =
            dados.dispositivos
                .map(function(dispositivo) {

                    const id =
                        String(
                            dispositivo.deviceId
                        );

                    const idSeguro =
                        escaparJS(id);

                    const status =
                        dispositivo.status || "OFFLINE";

                    const classeStatus =
                        status === "ONLINE"
                            ? "online"
                            : "offline";

                    return \`
<div class="card">

    <h2>
        \${escaparJS(
            dispositivo.modelo ||
            dispositivo.deviceId
        )}
    </h2>

    <p>
        <strong>ID:</strong><br>
        \${escaparJS(
            dispositivo.deviceId
        )}
    </p>

    <p>
        <strong>Status:</strong><br>
        <span class="\${classeStatus}">
            \${escaparJS(status)}
        </span>
    </p>

    <p>
        <strong>Bateria:</strong><br>
        \${escaparJS(
            dispositivo.bateria ?? "N/A"
        )}%
    </p>

    <p>
        <strong>Android:</strong><br>
        \${escaparJS(
            dispositivo.android || "N/A"
        )}
    </p>

    <p>
        <strong>IP:</strong><br>
        \${escaparJS(
            dispositivo.ip || "N/A"
        )}
    </p>

    <p>
        <strong>Localização:</strong><br>
        \${escaparJS(
            dispositivo.endereco ||
            "Não disponível"
        )}
    </p>

    <button
        class="lock"
        onclick="bloquearTela('\${encodeURIComponent(idSeguro)}')"
    >
        BLOQUEAR TELA
    </button>

</div>
\`;

                })
                .join("");

    } catch (erro) {

        console.error(erro);

        document.getElementById(
            "listaDispositivos"
        ).innerHTML =
            "<p>Erro de conexão com o servidor.</p>";

    }

}

// ========================================
// BLOQUEAR TELA
// ========================================

async function bloquearTela(deviceId) {

    const id =
        decodeURIComponent(deviceId);

    const confirmar =
        confirm(
            "Deseja enviar o comando para bloquear a tela deste dispositivo?"
        );

    if (!confirmar) {
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

                    body: JSON.stringify({
                        deviceId: id,
                        command: "LOCK_SCREEN"
                    })
                }
            );

        const dados =
            await resposta.json();

        if (!resposta.ok) {

            alert(
                dados.erro ||
                "Não foi possível enviar o comando."
            );

            return;
        }

        alert(
            "Comando de bloqueio enviado."
        );

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de conexão com o servidor."
        );

    }

}

// ========================================
// ENVIAR NOTIFICAÇÃO
// ========================================

async function enviarNotificacao() {

    const deviceId =
        document.getElementById(
            "deviceNotificacao"
        ).value.trim();

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

    if (!deviceId) {

        alert(
            "Informe o ID do dispositivo."
        );

        return;
    }

    if (!mensagem) {

        alert(
            "Informe uma mensagem."
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

                    body: JSON.stringify({
                        deviceId: deviceId,
                        command: "NOTIFICATION",
                        titulo: titulo,
                        mensagem: mensagem,
                        som: som,
                        vibrar: vibrar
                    })
                }
            );

        const dados =
            await resposta.json();

        if (!resposta.ok) {

            alert(
                dados.erro ||
                "Erro ao enviar notificação."
            );

            return;
        }

        alert(
            "Notificação enviada para a fila."
        );

        document.getElementById(
            "mensagem"
        ).value = "";

    } catch (erro) {

        console.error(erro);

        alert(
            "Erro de conexão com o servidor."
        );

    }

}

// ========================================
// HISTÓRICO
// ========================================

async function carregarHistorico() {

    try {

        const resposta =
            await fetch(
                "/api/history",
                {
                    cache: "no-store"
                }
            );

        const dados =
            await resposta.json();

        const lista =
            document.getElementById(
                "listaHistorico"
            );

        if (
            !dados.sucesso ||
            !Array.isArray(dados.historico)
        ) {

            lista.innerHTML =
                "<p>Erro ao carregar histórico.</p>";

            return;
        }

        if (dados.historico.length === 0) {

            lista.innerHTML =
                "<p>Nenhum comando registrado.</p>";

            return;
        }

        lista.innerHTML =
            dados.historico
                .map(function(item) {

                    return \`
<div class="card">

    <strong>
        \${escaparJS(
            item.command
        )}
    </strong>

    <p>
        Dispositivo:
        \${escaparJS(
            item.deviceId
        )}
    </p>

    <p>
        \${escaparJS(
            item.detalhes
        )}
    </p>

    <span class="small">
        \${escaparJS(
            item.criadoEm
        )}
    </span>

</div>
\`;

                })
                .join("");

    } catch (erro) {

        console.error(erro);

        document.getElementById(
            "listaHistorico"
        ).innerHTML =
            "<p>Erro ao carregar histórico.</p>";

    }

}

// ========================================
// ATUALIZAÇÃO AUTOMÁTICA
// ========================================

carregarDispositivos();

setInterval(
    carregarDispositivos,
    5000
);

</script>

</body>

</html>
    `);
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, () => {

    console.log("");
    console.log(
        "========================================"
    );
    console.log(
        "        MASTER CONTROL ONLINE"
    );
    console.log(
        "========================================"
    );
    console.log(
        "Porta:",
        PORT
    );
    console.log(
        "Painel:",
        "http://localhost:" + PORT
    );
    console.log(
        "Bloqueio de tela: ATIVADO"
    );
    console.log(
        "========================================"
    );
    console.log("");

});