import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Building,
  CheckCircle2,
  FileCheck,
  PackageCheck,
  AlertCircle
} from 'lucide-react';
import { SchoolItem, CheckInRecord } from '../types';
import { getCurrentPositionAsync } from '../utils/geo';
import { useClock, formatDateTime } from '../utils/useClock';

interface MediaDeliveryModalProps {
  checkInRecord: CheckInRecord;
  school: SchoolItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelivery: (deliveryData: {
    mediaDelivered: boolean;
    mediaDeliveredAt: string;
    mediaDeliveredTimestamp: number;
    mediaDeliveredProtocol: string;
    mediaDeliveredLat: number | null;
    mediaDeliveredLng: number | null;
    mediaDeliveredAccuracy: number | null;
    mediaDeliveredNotes?: string;
  }) => Promise<void>;
}

export const MediaDeliveryModal: React.FC<MediaDeliveryModalProps> = ({
  checkInRecord,
  school,
  isOpen,
  onClose,
  onConfirmDelivery
}) => {
  const currentTime = useClock();
  const [loadingGps, setLoadingGps] = useState(true);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [protocol] = useState(() => {
    const code = Math.floor(100000 + Math.random() * 900000);
    return `MIDIA-22BPMI-${code}`;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingGps(true);

    getCurrentPositionAsync().then((pos) => {
      if (!isMounted) return;
      setLoadingGps(false);
      if (pos) {
        setLat(pos.lat);
        setLng(pos.lng);
        setAccuracy(pos.accuracy);
      } else {
        setLat(null);
        setLng(null);
        setAccuracy(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    const now = Date.now();
    const formattedTime = formatDateTime(new Date(now));

    try {
      await onConfirmDelivery({
        mediaDelivered: true,
        mediaDeliveredAt: formattedTime,
        mediaDeliveredTimestamp: now,
        mediaDeliveredProtocol: protocol,
        mediaDeliveredLat: lat,
        mediaDeliveredLng: lng,
        mediaDeliveredAccuracy: accuracy,
        mediaDeliveredNotes: notes.trim() || undefined
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[94vh] sm:max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                Entrega de Mídias no Cartório Eleitoral
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-semibold">
                Finalização de Missão e Desmobilização do Posto
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="py-3.5 sm:py-4 space-y-3 sm:space-y-4 overflow-y-auto min-h-0 flex-1 pr-0.5">
          {/* Policial Militar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
            <div className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
              Policial Militar Responsável
            </div>
            <div className="font-black text-slate-900 text-sm">
              {checkInRecord.rank} {checkInRecord.officerName}
            </div>
            <div className="font-mono text-xs text-blue-700 font-bold">
              RE: {checkInRecord.officerRe} · Turno da Tarde / Término
            </div>
          </div>

          {/* Posto Escolar e Cartório de Destino */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">
                Posto Escolar de Origem
              </span>
              <div className="font-bold text-slate-800 leading-tight">
                {school.school}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {school.city} · Zona {school.zone}
              </div>
            </div>

            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1">
              <span className="text-[10px] text-purple-700 font-extrabold uppercase tracking-wider block">
                Destino Oficial
              </span>
              <div className="font-bold text-purple-950 leading-tight flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                <span>Cartório / Junta Eleitoral</span>
              </div>
              <div className="text-[11px] text-purple-800 font-medium">
                Zona Eleitoral {school.zone} ({school.city})
              </div>
            </div>
          </div>

          {/* Dados de Auditoria e Horário Oficial */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                Horário da Entrega:
              </span>
              <span className="font-mono font-black text-slate-900 text-xs">
                {currentTime}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-slate-600" />
                Protocolo de Entrega:
              </span>
              <span className="font-mono font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-xs border border-purple-200">
                {protocol}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/80 pt-2">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-600" />
                Geolocalização (Cartório):
              </span>
              <span className="font-mono text-[11px] font-bold text-slate-700">
                {loadingGps ? (
                  <span className="text-amber-700 animate-pulse">Obtendo coordenadas...</span>
                ) : lat && lng ? (
                  <span className="text-emerald-700 font-semibold">
                    {lat.toFixed(5)}, {lng.toFixed(5)}{' '}
                    {accuracy ? `(±${Math.round(accuracy)}m)` : ''}
                  </span>
                ) : (
                  <span className="text-slate-400">Sem sinal GPS (Registrado por protocolo)</span>
                )}
              </span>
            </div>
          </div>

          {/* Observações da Entrega (Opcional) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">
              Observações da Entrega (opcional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Mídias e atas entregues sem alterações ao chefe de cartório."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
              maxLength={150}
            />
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span className="leading-snug">
              Ao confirmar, o sistema registrará que as mídias da urna foram entregues no Cartório Eleitoral, atualizando o Painel de Comando da P/3 com o encerramento do seu posto.
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer min-h-[42px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-2 px-4 py-2.5 text-xs font-black text-white bg-purple-700 hover:bg-purple-800 active:scale-[0.98] rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[42px] disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Gravando Entrega...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Entrega no Cartório</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
