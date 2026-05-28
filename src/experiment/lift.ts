import { ExperimentStore } from "./store.js";
import { Impression } from "../domain/types.js";

export interface AdvertiserLift {
  advertiserId: string;
  treatmentImpressions: number;
  treatmentConversions: number;
  holdoutImpressions: number;
  holdoutConversions: number;
  treatmentCR: number | null;
  holdoutCR: number | null;
  lift: number | null;
  incrementalConversions: number | null;
  incrementalBill: number | null;
  status: "ok" | "insufficient_data";
}

export interface TrustReport {
  category: string;
  served: number;
  declined: number;
  declineRate: number | null;
}

export interface LiftReport {
  advertisers: AdvertiserLift[];
  aggregate: AdvertiserLift;
  totalIncrementalBill: number;
  trust: TrustReport[];
}

export class LiftService {
  constructor(private store: ExperimentStore) {}

  private computeArm(impressions: Impression[], advertiserId: string): AdvertiserLift {
    const treatment = impressions.filter((i) => i.cohort === "treatment");
    const holdout = impressions.filter((i) => i.cohort === "holdout");
    const tImp = treatment.length;
    const hImp = holdout.length;
    const tConv = treatment.filter((i) => i.converted).length;
    const hConv = holdout.filter((i) => i.converted).length;

    if (tImp === 0 || hImp === 0) {
      return {
        advertiserId,
        treatmentImpressions: tImp,
        treatmentConversions: tConv,
        holdoutImpressions: hImp,
        holdoutConversions: hConv,
        treatmentCR: tImp ? tConv / tImp : null,
        holdoutCR: hImp ? hConv / hImp : null,
        lift: null,
        incrementalConversions: null,
        incrementalBill: null,
        status: "insufficient_data",
      };
    }

    const treatmentCR = tConv / tImp;
    const holdoutCR = hConv / hImp;
    const lift = treatmentCR > 0 ? (treatmentCR - holdoutCR) / treatmentCR : null;
    const incrementalConversions = tConv - tImp * holdoutCR;
    const cpa = treatment[0]?.cpa ?? 0;
    const incrementalBill = Math.max(0, incrementalConversions) * cpa;

    return {
      advertiserId,
      treatmentImpressions: tImp,
      treatmentConversions: tConv,
      holdoutImpressions: hImp,
      holdoutConversions: hConv,
      treatmentCR,
      holdoutCR,
      lift,
      incrementalConversions,
      incrementalBill,
      status: "ok",
    };
  }

  report(): LiftReport {
    const all = this.store.allImpressions();
    const advertiserIds = [...new Set(all.map((i) => i.advertiserId))];
    const advertisers = advertiserIds.map((id) =>
      this.computeArm(all.filter((i) => i.advertiserId === id), id),
    );
    const aggregate = this.computeArm(all, "ALL");
    const totalIncrementalBill = advertisers.reduce(
      (sum, a) => sum + (a.incrementalBill ?? 0),
      0,
    );

    const trust: TrustReport[] = [...this.store.trustByCategory().entries()].map(
      ([category, t]) => {
        const total = t.served + t.declined;
        return {
          category,
          served: t.served,
          declined: t.declined,
          declineRate: total ? t.declined / total : null,
        };
      },
    );

    return { advertisers, aggregate, totalIncrementalBill, trust };
  }
}
