export interface TermsOfServiceSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface TermsOfServiceContent {
  title: string;
  lead: string;
  effectiveDateLabel: string;
  lastUpdatedLabel: string;
  sections: TermsOfServiceSection[];
  contactEmail: string;
  contactNote: string;
}

export const termsOfServiceContent: TermsOfServiceContent = {
  title: '利用規約',
  lead:
    '本利用規約（以下「本規約」）は、四遊楽ガチャツール運営（以下「運営者」）が提供する「四遊楽ガチャツール」（以下「本サービス」）の利用条件を定めるものです。',
  effectiveDateLabel: '施行日: 2026年2月12日',
  lastUpdatedLabel: '最終更新日: 2026年2月12日',
  sections: [
    {
      id: 'application',
      title: '第1条（適用）',
      paragraphs: [
        '本規約は、本サービスの提供条件および本サービスの利用に関する運営者と利用者との間の権利義務関係を定めることを目的とし、利用者と運営者との間の本サービス利用に関わる一切の関係に適用されます。',
        '運営者が本サービス上で掲載する個別ルールや注意事項は、本規約の一部を構成します。'
      ]
    },
    {
      id: 'eligibility',
      title: '第2条（利用条件）',
      paragraphs: [
        '利用者は、本規約に同意した上で本サービスを利用するものとします。',
        '利用者が未成年者である場合、法定代理人の同意を得た上で本サービスを利用してください。'
      ]
    },
    {
      id: 'prohibited-acts',
      title: '第3条（禁止事項）',
      paragraphs: ['利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。'],
      bullets: [
        '法令または公序良俗に違反する行為',
        '犯罪行為に関連する行為',
        '本サービスの運営を妨害する行為',
        '不正アクセス、またはそれを試みる行為',
        '他の利用者または第三者の権利を侵害する行為',
        '本サービスを通じて取得した情報の不正利用',
        '虚偽情報の登録または送信',
        '反社会的勢力に対する利益供与その他の協力行為',
        'その他、運営者が不適切と判断する行為'
      ]
    },
    {
      id: 'external-service',
      title: '第4条（外部サービス連携）',
      paragraphs: [
        '本サービスは、Discordその他の外部サービスと連携する機能を提供する場合があります。',
        '外部サービスの利用には、当該サービスの利用規約・ポリシーが適用されます。外部サービスの仕様変更、障害、利用制限等により本サービスの一部機能が利用できない場合があります。'
      ]
    },
    {
      id: 'intellectual-property',
      title: '第5条（知的財産権）',
      paragraphs: [
        '本サービスに関する著作権、商標権その他の知的財産権は、運営者または正当な権利者に帰属します。',
        '利用者は、法令で認められる範囲を超えて、運営者の許諾なく本サービスの内容を複製、転載、改変、再配布してはなりません。'
      ]
    },
    {
      id: 'disclaimer',
      title: '第6条（保証の否認および免責）',
      paragraphs: [
        '運営者は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定目的適合性、セキュリティ上の欠陥、エラーやバグ、権利侵害等を含みますがこれらに限りません。）がないことを保証しません。',
        '運営者は、本サービスの利用または利用不能により利用者に生じた損害について、運営者の故意または重過失による場合を除き、責任を負いません。'
      ]
    },
    {
      id: 'service-change',
      title: '第7条（サービス内容の変更・停止・終了）',
      paragraphs: [
        '運営者は、利用者への事前通知なく、本サービスの全部または一部の内容を変更し、または提供を中断・終了することができます。',
        '運営者は、これによって利用者に生じた損害について責任を負いません。'
      ]
    },
    {
      id: 'terms-revision',
      title: '第8条（規約の変更）',
      paragraphs: [
        '運営者は、必要と判断した場合には、本規約を変更できます。',
        '変更後の本規約は、本サービス上への掲載その他運営者が適切と判断する方法で周知した時点から効力を生じるものとします。'
      ]
    },
    {
      id: 'governing-law',
      title: '第9条（準拠法・裁判管轄）',
      paragraphs: [
        '本規約の解釈にあたっては、日本法を準拠法とします。',
        '本サービスに関して紛争が生じた場合、運営者所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。'
      ]
    }
  ],
  contactEmail: 'support@example.com（※運用前に実連絡先へ変更してください）',
  contactNote: '本規約に関するお問い合わせは、上記連絡先までご連絡ください。'
};
