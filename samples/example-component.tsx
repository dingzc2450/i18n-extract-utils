"use client";

import * as React from "react";

function MyComponent() {
    const { t } = useTranslation();
    
    return (
        <div>
        <h1>___Hello World___</h1>
        <p>{t("Existing translation")}</p>
        </div>
    );
}