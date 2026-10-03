"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodReview, IfoodReviewSummary, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  Star,
  MessageSquare,
  Send,
  CheckCircle,
  ThumbsUp,
  RefreshCw,
  User,
  CornerDownRight,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodReviewsTab({ unitId, credentials }: Props) {
  const [summary, setSummary] = useState<IfoodReviewSummary | null>(null);
  const [reviews, setReviews] = useState<IfoodReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});
  const [submittingMap, setSubmittingMap] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";

  const loadReviews = async () => {
    setLoading(true);
    try {
      const [sumData, revsData] = await Promise.all([
        IfoodService.getReviewSummary(unitId, merchantId),
        IfoodService.getReviews(unitId, merchantId),
      ]);
      setSummary(sumData);
      setReviews(revsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [unitId, merchantId]);

  const handleSendReply = async (reviewId: string) => {
    const text = replyTextMap[reviewId]?.trim();
    if (!text) return;

    setSubmittingMap((prev) => ({ ...prev, [reviewId]: true }));
    try {
      await IfoodService.replyReview(unitId, merchantId, reviewId, text);
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, reply: { text, answeredAt: "Agora mesmo" } }
            : r
        )
      );
      setReplyTextMap((prev) => ({ ...prev, [reviewId]: "" }));
      setFeedback("Resposta enviada com sucesso ao cliente no iFood!");
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erro ao enviar resposta: ${err.message}`);
    } finally {
      setSubmittingMap((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Review Metrics */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <span className="text-3xl font-extrabold text-amber-500 block">
                {summary?.averageScore.toFixed(1) || "4.8"}
              </span>
              <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-500">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 block">
                {summary?.totalReviews || 247} avaliações
              </span>
            </div>

            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                Reputação no iFood (Review v2.0)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Lojas com nota acima de 4.5 recebem o selo Super Restaurante e ganham até 30% mais visibilidade nas buscas.
              </p>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="w-full sm:w-64 space-y-1.5 text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="w-4">5★</span>
              <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${summary?.fiveStarPercent || 86}%` }} />
              </div>
              <span className="w-8 text-right font-medium">{summary?.fiveStarPercent || 86}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4">4★</span>
              <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${summary?.fourStarPercent || 10}%` }} />
              </div>
              <span className="w-8 text-right font-medium">{summary?.fourStarPercent || 10}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4">3★</span>
              <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${summary?.threeStarPercent || 3}%` }} />
              </div>
              <span className="w-8 text-right font-medium">{summary?.threeStarPercent || 3}%</span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
          Últimos Comentários e Avaliações
        </h4>

        {reviews.map((rev) => {
          const isSubmitting = submittingMap[rev.id] || false;
          return (
            <div
              key={rev.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-600 dark:text-zinc-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                      {rev.customerName}
                    </h5>
                    <span className="text-[10px] text-zinc-400">
                      Pedido #{rev.orderId} • {rev.createdAt}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${
                        i < rev.score ? "fill-current" : "text-zinc-200 dark:text-zinc-700"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {rev.comment && (
                <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50/60 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  "{rev.comment}"
                </p>
              )}

              {/* Loja Reply se já respondido */}
              {rev.reply ? (
                <div className="pl-4 border-l-2 border-red-500 space-y-1 text-xs text-zinc-600 dark:text-zinc-400 pt-1">
                  <div className="flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200 text-[11px]">
                    <CornerDownRight className="w-3.5 h-3.5 text-red-600" />
                    Resposta da House 190 ({rev.reply.answeredAt}):
                  </div>
                  <p className="italic text-zinc-700 dark:text-zinc-300">{rev.reply.text}</p>
                </div>
              ) : (
                /* Responder Avaliação */
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Escreva uma resposta pública para este cliente..."
                    value={replyTextMap[rev.id] || ""}
                    onChange={(e) =>
                      setReplyTextMap((prev) => ({ ...prev, [rev.id]: e.target.value }))
                    }
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    onClick={() => handleSendReply(rev.id)}
                    disabled={isSubmitting || !replyTextMap[rev.id]?.trim()}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className={`w-3 h-3 ${isSubmitting ? "animate-spin" : ""}`} />
                    Responder
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
