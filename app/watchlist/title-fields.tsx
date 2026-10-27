"use client";
import { contentTypes, fixedMoods, type MetadataValues, type MetadataField } from "../../lib/title-state";
export type { MetadataValues, MetadataField } from "../../lib/title-state";
export function MetadataFields({ values, moods, update, setMoods, errors, sourceFields = false }: {
  values: MetadataValues; moods: string[]; update: (field: keyof MetadataValues, value: string) => void;
  setMoods: (updater: (previous: string[]) => string[]) => void; errors: Partial<Record<MetadataField, string>>; sourceFields?: boolean;
}) {
  const episodic = values.contentType === "series" || values.contentType === "anime";
  const fieldProps = (field: MetadataField) => ({ "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `${field}-error` : undefined });
  const error = (field: MetadataField) => errors[field] ? <p className="field-error" id={`${field}-error`} role="alert">{errors[field]}</p> : null;
  return <>
      <label className="field-label" htmlFor="contentType">Content type</label>
      <select className="field visually-hidden source-type-select" id="contentType" name="contentType" value={values.contentType} onChange={(e) => update("contentType", e.target.value)} {...fieldProps("contentType")}>
        <option value="">Choose content type</option>
        {contentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>{error("contentType")}
      <div className="source-type-tiles" role="group" aria-label="Type">
        {contentTypes.map(type => <button key={type.value} type="button" className="source-type-tile" aria-pressed={values.contentType === type.value} onClick={() => update("contentType", type.value)}><span className={`source-type-icon source-type-${type.value}`} aria-hidden="true" />{type.value === "youtube" ? "YouTube video" : type.label}</button>)}
      </div>
      <label className="field-label" htmlFor="title">Title</label>
      <input className="field" id="title" name="title" value={values.title} onChange={(e) => update("title", e.target.value)} {...fieldProps("title")} />{error("title")}
      <div className="source-detail-row"><fieldset className="form-fields duration-fields"><legend className="field-label">{episodic ? "Typical episode duration" : "Full duration"}</legend>
        <p className="field-hint">1 second to 24 hours. Use whole minutes and seconds; seconds may be left blank.</p>
        <div><label htmlFor="minutes">Minutes</label><input className="field" inputMode="numeric" id="minutes" name="minutes" value={values.minutes} onChange={(e) => update("minutes", e.target.value)} {...fieldProps("minutes")} />{error("minutes")}</div>
        <div><label htmlFor="seconds">Seconds (optional)</label><input className="field" inputMode="numeric" id="seconds" name="seconds" value={values.seconds} onChange={(e) => update("seconds", e.target.value)} {...fieldProps("seconds")} />{error("seconds")}</div>
      </fieldset>
      <div className="source-genre-field"><label className="field-label" htmlFor="genres">Genres (optional)</label><p className="field-hint" id="genres-hint">Separate with commas. Up to ten genres, 40 characters each.</p>
      <input className="field" id="genres" name="genres" value={values.genres} onChange={(e) => update("genres", e.target.value)} {...fieldProps("genres")} aria-describedby={`genres-hint${errors.genres ? " genres-error" : ""}`} />{error("genres")}</div></div>
      {episodic ? <><label className="field-label" htmlFor="numberingStyle">Episode numbering</label>
        <select className="field" id="numberingStyle" name="numberingStyle" value={values.numberingStyle} onChange={(e) => update("numberingStyle", e.target.value)} {...fieldProps("numberingStyle")}>
          <option value="">Choose numbering</option><option value="season_episode">Season + episode</option><option value="continuous">Continuous numbering</option>
        </select>{error("numberingStyle")}</> : <input type="hidden" name="numberingStyle" value="none" />}
      <fieldset className="mood-choices" {...fieldProps("moods")}><legend className="field-label">Moods (choose at least one)</legend>
        {fixedMoods.map((mood) => <label className="color-choice" key={mood.value}><input type="checkbox" name="moods" value={mood.value} checked={moods.includes(mood.value)} onChange={(e) => setMoods((previous) => e.target.checked ? [...previous, mood.value] : previous.filter((value) => value !== mood.value))} />{mood.label}</label>)}
      </fieldset>{error("moods")}
      <label className="field-label" htmlFor="watchUrl">External watch link (optional)</label><input className="field" id="watchUrl" name="watchUrl" type="url" value={values.watchUrl} onChange={(e) => update("watchUrl", e.target.value)} {...fieldProps("watchUrl")} />{error("watchUrl")}

    {sourceFields && <>{(["sourceUrl", "coverUrl"] as const).map((field) => <div className="form-fields" key={field}><label className="field-label" htmlFor={field}>{field === "sourceUrl" ? "Source link (optional)" : "Cover image link (optional)"}</label><input className="field" id={field} name={field} type="url" value={values[field]} onChange={(event) => update(field, event.target.value)} {...fieldProps(field)} />{error(field)}</div>)}</>}
  </>;
}
