"use client";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, {
  CSSProperties,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClipLoader, RingLoader } from "react-spinners";

// WS types
type WsMsg = { op: string; reqId?: string; args?: Record<string, unknown> };
type WsReply =
  | { event: "ready"; payload: { clientId: string } }
  | { event: "reply"; payload: { reqId?: string; ok: true; payload: any } }
  | { event: "reply"; payload: { reqId?: string; ok: false; payload: any } }
  | { event: "error"; payload: { message: string; error?: string } };

// type BankForm = {
//   itau: {
//     semCnh: true;
//     taxista: false;
//     pcd: true;
//     ano: [];
//     marca: "";
//     valor: 0;
//     zeroKm: true;
//   };
// };

type AvailableBanks = "itau" | "bancopan";

type ItauFields = "valor" | "ano" | "marcaModeloVersao" | "condicao";
type BancoPanFields =
  | "valor"
  | "ano"
  | "marca"
  | "modelo"
  | "versao"
  | "condicao";

type BaseBankStructure = {
  semCnh: boolean;
  taxista: boolean;
  pcd: boolean;
  ano: number[];
  marcaModeloVersao: string;
  valor: number;
  condicao: "usado" | "novo";
};

type BankStructures = {
  itau: BaseBankStructure;
  bancopan: BaseBankStructure;
};

type BanksData = {
  [K in AvailableBanks]: BankStructures[K];
};

type BaseVehicleOptionsStruct = {
  years: string[];
  marcaModeloVersao: string[];
  financing: boolean;
};

type VehicleOptionsStruct = {
  itau: BaseVehicleOptionsStruct;
  bancopan: BaseVehicleOptionsStruct;
};

type VehicleOptions = {
  [K in AvailableBanks]: VehicleOptionsStruct[K];
};

export default function ChatFinancingPage() {
  const [banks, setBanks] = useState<BanksData>({
    itau: {
      semCnh: true,
      taxista: true,
      pcd: true,
      ano: [],
      valor: 0,
      marcaModeloVersao: "",
      condicao: "usado",
    },
    bancopan: {
      semCnh: true,
      taxista: true,
      pcd: true,
      ano: [],
      valor: 0,
      marcaModeloVersao: "",
      condicao: "usado",
    },
  });
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOptions>(
    {} as VehicleOptions
  );
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // WebSocket client
  const wsRef = useRef<WebSocket | null>(null);
  const wsUrl = useMemo(
    () =>
      process.env.NEXT_PUBLIC_WS_URL ||
      `ws://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJpZDAxIiwic3RvcmVJZCI6InN0b3JlLTAwMSIsImlhdCI6MTc1NjY3NDY1NSwiZXhwIjoxNzU2NzAzNDU1fQ.8_C5BIZga2-b9_YD9dmjTB-7uyFgud8TBLv1cdnKwrc`,
    []
  );
  const wsSeq = useRef(0);
  const pending = useRef(
    new Map<string, (ok: boolean, payload: any) => void>()
  );
  const [wsReady, setWsReady] = useState(false);
  const [tab, setTab] = useState<"semtab" | "loading" | AvailableBanks>(
    "semtab"
  );

  const connectWs = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    )
      return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setWsReady(false);

    ws.onopen = () => {
      setWsReady(true);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsReply;
        if (msg.event === "ready") {
          console.error("ws error");
        } else if (msg.event === "reply") {
          const { reqId, ok, payload } = msg.payload || {};
          if (reqId && pending.current.has(reqId)) {
            const res = pending.current.get(reqId)!;
            pending.current.delete(reqId);
            res(ok, payload);
          }
        } else if (msg.event === "error") {
          console.error("ws error");
        }
      } catch {}
    };
    ws.onclose = () => {
      setWsReady(false);
      setTimeout(connectWs, 2000);
    };
    ws.onerror = () => {};
  }, [wsUrl]);

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWs]);

  const sendWs = useCallback(
    async (op: string, args?: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN)
        throw new Error("WebSocket não conectado");
      const reqId = String(++wsSeq.current);
      const msg: WsMsg = { op, reqId, args };
      ws.send(JSON.stringify(msg)); // <<< envia exatamente { op, reqId, args }
      return new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.current.delete(reqId);
          reject(new Error(`timeout aguardando reply ${reqId}`));
        }, 30000);
        pending.current.set(reqId, (ok, payload) => {
          clearTimeout(timeout);
          ok ? resolve(payload) : reject(payload);
        });
      });
    },
    []
  );
  // await sendWs("isAvailableForFinancing", {
  //   cpf: "01401007171",
  //   bancos: ["itau"],
  // });

  // “isAvailableForFinancing” (via WS: abre página, digita CPF, clica continuar)

  const changeInputPicker = <T = ItauFields,>(bankName: AvailableBanks) => {
    return (field: T, value: any) => {
      setBanks((bank) => ({
        ...banks,
        [bankName]: {
          ...bank[bankName],
          [field as string]: value,
        },
      }));
    };
  };

  const headerRight = useMemo(() => {
    const wsBadge = wsReady ? (
      <span className="text-xs p-2 rounded-full bg-emerald-100 text-emerald-700"></span>
    ) : (
      <span className="text-xs p-2 rounded-full bg-amber-100 text-amber-700"></span>
    );
    return (
      <div className="flex items-center gap-2">
        {wsBadge}
        {/* {cpfBadge} */}
      </div>
    );
  }, [wsReady]);

  useEffect(() => {
    console.log({ vehicleOptions });
  }, [vehicleOptions]);

  const handleCpfSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;

    setTab("loading");

    const apiResponse = {
      itau: { years: ["2000", "2002", "2005", "2006"], financing: true },
      bancopan: { years: [], financing: false },
    } satisfies Record<AvailableBanks, { years: string[]; financing: boolean }>;

    const t = setTimeout(() => {
      const entries = Object.entries(apiResponse) as [
        AvailableBanks,
        { years: string[]; financing: boolean }
      ][];

      setVehicleOptions((prev) => {
        const next = { ...prev };
        for (const [bankName, { years, financing }] of entries) {
          if (financing) {
            next[bankName] = { ...prev[bankName], financing, years };
          }
        }
        return next;
      });

      const firstWithFinancing =
        entries.find(([, v]) => v.financing)?.[0] ?? null;
      if (firstWithFinancing) setTab(firstWithFinancing);

      setLoading(false);
    }, 2000);

    // opcional: se seu componente pode desmontar, limpe o timer
    // return () => clearTimeout(t);  // se estiver dentro de um useEffect
  };

  useEffect(() => {
    // <Spinner />
    console.log({ banks });
  }, [banks]);

  const renderOrNull = (
    bankName: AvailableBanks,
    Component: React.ComponentType<any>
  ): ReactElement | null => {
    if (!vehicleOptions[bankName]?.financing) return null;

    return (
      <Component
        availableYears={vehicleOptions[bankName].years}
        changeInputHandler={changeInputPicker<any>(bankName)} // tipagem dinâmica
        banks={banks}
      />
    );
  };

  const override: CSSProperties = {
    display: "block",
    margin: "0 auto",
    borderColor: "red",
  };
  const renderTabs: Record<AvailableBanks | "semtab" | "loading", ReactNode> = {
    itau: renderOrNull("itau", ItauForm),
    bancopan: renderOrNull("bancopan", BancoPanForm),
    semtab: <div>Digite o CPF acima e pressione Enter</div>,
    loading: (
      <div className="flex items-center justify-center z-50 w-full h-full ">
        <RingLoader />
      </div>
    ),
  };

  return (
    <div className="max-lg flex flex-col min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">
            Simulador de Financiamento
          </h1>
          <Input
            placeholder="Digite o CPF"
            onKeyDown={handleCpfSearch}
            className="flex-1 max-w-sm"
          />
          {headerRight}
        </div>
      </header>

      {/* MENU HORIZONTAL */}
      <nav className="border-b bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar px-4 py-2">
            {Object.keys(vehicleOptions).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`shrink-0 px-4 py-2 cursor-pointer rounded-full border text-sm font-medium transition
                ${
                  tab === k
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-neutral-700 hover:bg-neutral-100 border-neutral-300"
                }`}
                aria-pressed={tab === k}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4">
          <div className="min-h-[60vh] grid place-items-center py-10">
            {renderTabs[tab]}
            {/* {tab === "bancopan" && <BancoPanForm setBanks={setBanks} banks={banks}/>} */}
          </div>
        </div>
      </main>
    </div>
  );
}

interface BancoProps {
  changeInputHandler: (fields: BancoPanFields, value: any) => void;
  banks: BanksData;
  availableYears: string[];
}
const BancoPanForm: React.FC<BancoProps> = ({
  changeInputHandler,
  availableYears,
  banks,
}) => {
  return (
    <div className="w-full text-center">
      <div className="inline-block rounded-2xl border px-8 py-10 bg-white shadow-sm w-full max-w-md text-left">
        <h2 className="text-xl font-semibold mb-6">BancoPan</h2>

        {/* Condição */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Condição do veículo
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="condicao"
                value="usado"
                checked={banks.itau.condicao === "usado"}
                onChange={() => changeInputHandler("condicao", "usado")}
              />
              Usado
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="condicao"
                value="Novo"
                checked={banks.itau.condicao === "novo"}
                onChange={() => changeInputHandler("condicao", "novo")}
              />
              0 km
            </label>
          </div>
        </div>

        <div className="mb-4 w-full">
          <Select onValueChange={() => changeInputHandler("condicao", "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Modelo */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Marca, modelo e versão
          </label>
          <input
            type="text"
            placeholder="Ex: Fiat Argo 1.3"
            onChange={(e) => setModelo(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>

        {/* Valor */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Valor do veículo
          </label>
          <input
            type="number"
            placeholder="R$ 0,00"
            // value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>
        <Button>Próximo</Button>
      </div>
    </div>
  );
};

interface ItauProps {
  changeInputHandler: (fields: ItauFields, value: any) => void;
  banks: BanksData;
  availableYears: string[];
}
const ItauForm: React.FC<ItauProps> = ({
  changeInputHandler,
  availableYears,
  banks,
}) => {
  return (
    <div className="w-full text-center">
      <div className="inline-block rounded-2xl border px-8 py-10 bg-white shadow-sm w-full max-w-md text-left">
        <h2 className="text-xl font-semibold mb-6">Itau</h2>

        {/* Condição */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Condição do veículo
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="condicao"
                value="usado"
                checked={banks.itau.condicao === "usado"}
                onChange={() => changeInputHandler("condicao", "usado")}
              />
              Usado
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="condicao"
                value="Novo"
                checked={banks.itau.condicao === "novo"}
                onChange={() => changeInputHandler("condicao", "novo")}
              />
              0 km
            </label>
          </div>
        </div>

        <div className="mb-4 w-full">
          <Combobox
            label="Veículo"
            options={[{ value: "Fiat", label: "Fiat" }]}
          />
        </div>

        <div className="mb-4 w-full">
          <Select onValueChange={() => changeInputHandler("condicao", "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Modelo */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Marca, modelo e versão
          </label>
          <input
            type="text"
            placeholder="Ex: Fiat Argo 1.3"
            onChange={(e) => setModelo(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>

        {/* Valor */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Valor do veículo
          </label>
          <input
            type="number"
            placeholder="R$ 0,00"
            // value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring focus:ring-blue-200"
          />
        </div>
        <Button>Próximo</Button>
      </div>
    </div>
  );
};
