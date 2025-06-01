import { motion } from 'framer-motion';

function BanPickPanel({ selected }) {
  return (
    <div className="bg-slate-800 p-4 rounded-2xl shadow-lg">
      <h3 className="text-xl font-semibold mb-2">선택된 맵</h3>
      <div className="flex flex-wrap gap-3">
        {selected.map((map, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`px-3 py-1 rounded-full font-medium ${
              map.type === 'pick' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {map.name} ({map.type})
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default BanPickPanel;
