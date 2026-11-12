import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookA, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, IconButton, Input, SectionTitle, Textarea, useToast } from "../components/ui";
import { bridge } from "../lib/bridge";
import type { DictionaryEntry, Snippet } from "../lib/bridge";

export default function Dictionary() {
  const [list, setList] = useState<DictionaryEntry[]>([]);
  const [word, setWord] = useState("");
  const [to, setTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [trigger, setTrigger] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    bridge.getDictionary().then(setList);
    bridge.getSnippets().then(setSnippets);
  }, []);

  const saveSnippets = (next: Snippet[]) => {
    setSnippets(next);
    bridge.setSnippets(next);
  };
  const addSnippet = () => {
    const t = trigger.trim();
    if (!t || !body.trim()) return;
    if (snippets.some((s) => s.trigger.toLowerCase() === t.toLowerCase())) {
      toast(`You already have a snippet called “${t}”`, "error");
      return;
    }
    saveSnippets([{ id: crypto.randomUUID(), trigger: t, text: body }, ...snippets]);
    setTrigger("");
    setBody("");
  };

  const save = (next: DictionaryEntry[]) => {
    setList(next);
    bridge.setDictionary(next);
  };

  const add = () => {
    const w = word.trim();
    if (!w) return;
    if (list.some((d) => d.word.toLowerCase() === w.toLowerCase())) {
      toast(`“${w}” is already in your dictionary`, "error");
      return;
    }
    save([{ id: crypto.randomUUID(), word: w, to: to.trim() || undefined }, ...list]);
    setWord("");
    setTo("");
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-14 pb-12">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dictionary</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-fg-3">
          Teach SayType names, jargon and acronyms so they're spelled right every time. Add a replacement to fix words it
          consistently mishears.
        </p>
      </header>

      <Card className="mb-6 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex items-center gap-2"
        >
          <Input ref={inputRef} value={word} onChange={(e) => setWord(e.target.value)} placeholder="Word or phrase, e.g. Anthropic" className="flex-1" />
          <ArrowRight className="size-4 shrink-0 text-fg-3" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Replace with (optional)" className="flex-1" />
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!word.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookA className="size-6" />}
            title="Your dictionary is empty"
            description="Add your name, your team's names, product names or technical terms. They're used as hints during transcription and enforced during cleanup."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">
            <span>{list.length} {list.length === 1 ? "entry" : "entries"}</span>
          </div>
          <ul>
            {list.map((d) => (
              <li key={d.id} className="group flex items-center gap-3 px-5 py-3 [&+&]:border-t [&+&]:border-line hover:bg-surface-2/60">
                {d.to ? (
                  <span className="flex items-center gap-2.5 text-[13.5px]">
                    <span className="text-fg-3 line-through decoration-fg-3/40">{d.word}</span>
                    <ArrowRight className="size-3.5 text-fg-3" />
                    <span className="font-medium">{d.to}</span>
                  </span>
                ) : (
                  <span className="text-[13.5px] font-medium">{d.word}</span>
                )}
                <IconButton
                  label="Remove"
                  className="ml-auto opacity-0 group-hover:opacity-100 hover:text-danger"
                  onClick={() => save(list.filter((x) => x.id !== d.id))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-12">
        <SectionTitle
          title="Voice snippets"
          description="Say a trigger phrase on its own and SayType types the saved text instead: an email signature, a stock reply, a template. Only an exact match triggers it, so normal sentences are never changed."
        />
        <Card className="mb-4 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSnippet();
            }}
            className="flex flex-col gap-2"
          >
            <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Say this, e.g. my signature" maxLength={80} />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="…and this gets typed" rows={3} />
            <div>
              <Button type="submit" variant="primary" icon={<Plus className="size-4" />} disabled={!trigger.trim() || !body.trim()}>
                Add snippet
              </Button>
            </div>
          </form>
        </Card>
        {snippets.length === 0 ? (
          <Card>
            <EmptyState
              icon={<MessageSquareText className="size-6" />}
              title="No snippets yet"
              description="Try “my email”, “my address” or “meeting notes template”. You can also say “insert” first."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {snippets.map((s) => (
                <li key={s.id} className="group flex items-start gap-3 px-5 py-3 [&+&]:border-t [&+&]:border-line hover:bg-surface-2/60">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">“{s.trigger}”</div>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] whitespace-pre-wrap text-fg-3">{s.text}</p>
                  </div>
                  <IconButton label="Remove" className="opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => saveSnippets(snippets.filter((x) => x.id !== s.id))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
